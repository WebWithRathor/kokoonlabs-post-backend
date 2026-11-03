import { randomUUID } from 'crypto';
import ErrorHandler from '../../utils/error-handler';
import logger from '../../config/logger';
import { iotStudioConfig } from '../../config/iot-studio.config';
import { iotBoardDao } from '../../dao/iot-board.dao';
import { userDao } from '../../dao/user.dao';
import { ProjectDao } from '../../dao/project.dao';
import { IIotBoard } from '../../interfaces/iot-board.interface';
import { seal, tryUnseal } from '../../utils/iot-crypto';
import {
  IotStudioClient,
  IotStudioError,
  Limiter,
  createIotStudioClient,
  createLimiter,
  lmsErrorFor,
  selfCheckVerdict,
  studentMessageFor,
  warningMessage
} from '../../utils/iot-studio-client';
import {
  BoardStatusView,
  BulkStatusResponse,
  IOT_BOARDS,
  IotBoardType,
  IotStatusEntry,
  LmsIdentity,
  MqttLogin,
  UNREGISTERED_STATUS,
  boardStatusOf,
  canSkipUpsert,
  checkVariables,
  createBatcher,
  createStatusCache,
  mapBulkStatus,
  mintSsoToken,
  newHardwareId,
  routeOfStudioUrl,
  sanitizeNext,
  statusNeedsUpsert,
  upsertComplete,
  upsertForFlash,
  upsertHash
} from '../../utils/iot-studio';

// Kokoon IoT Studio for students: their boards ("My boards"), getting a
// board ready to flash (contract B1), its live status (bulk status, B2),
// removing it (B3) and signing in to IoT Studio (SSO, contract A).

const MAX_BOARDS = 20;
const projectDao = new ProjectDao();

// Calls to IoT Studio from this process: at most this many open at once,
// this many more waiting; beyond that a call fails at once with "busy"
const IOT_MAX_CONCURRENT = 16;
const IOT_MAX_WAITING = 200;
// Status polls have their own, smaller cap, so a flood of panel polls while
// IoT Studio is slow can never fill the queue flashes wait in
const STATUS_MAX_CONCURRENT = 8;
const STATUS_MAX_WAITING = 100;
// A status call (its wait for a slot included) gives up after this: the
// editor's poll (10 s timeout) asks again, and a stale poll frees its place
const STATUS_IOT_DEADLINE_MS = 5_000;
// A flash's IoT Studio calls (tries, waits, timeouts) all end within this,
// so the whole request fits in 25 s (the editor waits 30 s for it)
const FLASH_IOT_DEADLINE_MS = 22_000;
// Board status: one answer per board is reused this long
const STATUS_TTL_MS = 10_000;
const STATUS_MAX_ENTRIES = 10_000;
// Most ids the bulk status endpoint takes in one call
const STATUS_BATCH = 200;
// Different students' polls this close together share one bulk status call
const STATUS_BATCH_WINDOW_MS = 25;
// Never a real board: the startup check expects IoT Studio to answer 404 not_found for it
const SELF_CHECK_HARDWARE_ID = 'kk-healthcheck-0000';

// ── IoT Studio's answers ────────────────────────────────────────────────────

interface Broker {
  url: string;
  host: string;
  port: number;
  tls: boolean;
}

interface DeviceUpsertResponse {
  deviceId: string;
  hardwareId: string;
  topicPrefix: string;
  broker: Broker;
  credentials: MqttLogin | null;
  projectId: string | null;
  studioUrl: string;
  warnings?: string[];
}

interface DeviceStatusResponse {
  deviceId: string;
  hardwareId: string;
  ownerLmsUserId: string;
  connectionState: string;
  lastSeenAt: number | null;
  projectIds: string[];
  studioUrl: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const requireEnabled = () => {
  if (!iotStudioConfig.enabled) {
    const err = new ErrorHandler({ statusCode: 503, errorCode: 'IOT_STUDIO_DISABLED', message: 'IoT Studio is not switched on for Kokoon yet.' });
    err.expose = true;
    throw err;
  }
};

const limiter = createLimiter(IOT_MAX_CONCURRENT, IOT_MAX_WAITING);
const statusLimiter = createLimiter(STATUS_MAX_CONCURRENT, STATUS_MAX_WAITING);
let api: IotStudioClient | null = null;
let statusApi: IotStudioClient | null = null;

const newClient = (cap: Limiter) =>
  createIotStudioClient({
    baseUrl: iotStudioConfig.apiUrl,
    secret: iotStudioConfig.apiSecret,
    limiter: cap,
    // Only what's needed to find the problem in IoT Studio's logs
    // (the startup check's 404 for its made-up board is the answer it wants)
    onFailure: info => {
      if (info.path.endsWith(`/devices/${SELF_CHECK_HARDWARE_ID}`) && info.status === 404) return;
      logger.warn('IoT Studio request failed', info);
    }
  });

// One client for the process, so every flash, reset and removal shares the limiter
const client = () => (api ??= newClient(limiter));
// Status polls only (see STATUS_MAX_CONCURRENT)
const statusClient = () => (statusApi ??= newClient(statusLimiter));
const statusDeadline = () => Date.now() + STATUS_IOT_DEADLINE_MS;

/** An IoT Studio error as the LMS's own error, with the message for the student. */
const asLmsError = (err: unknown, message?: string): never => {
  if (!(err instanceof IotStudioError)) throw err;
  const out = new ErrorHandler(lmsErrorFor(err, message));
  out.expose = true;
  throw out;
};

// Two clicks on Run / Upload must not race on one board. Kept in memory:
// right for the single pm2 process this runs as; with several processes
// two requests landing on different processes could still overlap.
const boardsInFlight = new Set<string>();

const withBoardLock = async <T>(userId: string, id: string, work: () => Promise<T>): Promise<T> => {
  const key = `${userId}:${id}`;
  if (boardsInFlight.has(key)) {
    throw new ErrorHandler(409, 'This board is already being uploaded to. Wait for that to finish, then try again.', 'IOT_FLASH_IN_PROGRESS');
  }
  boardsInFlight.add(key);
  try {
    return await work();
  } finally {
    boardsInFlight.delete(key);
  }
};

const notFound = () => new ErrorHandler({ statusCode: 404, errorCode: 'IOT_BOARD_NOT_FOUND', message: 'Board not found.' });

/** The student as IoT Studio knows them (contract A.1 / B1 "user"). */
const identityOf = async (userId: string): Promise<LmsIdentity> => {
  const user = await userDao.findById(userId);
  if (!user) throw new ErrorHandler({ statusCode: 404, errorCode: 'USER_NOT_FOUND', message: 'User not found.' });
  const email = String(user.email ?? '').trim().toLowerCase();
  if (!email) {
    // IoT Studio needs an email for every account; only Google sign-in gives one here
    throw new ErrorHandler({
      statusCode: 409,
      errorCode: 'IOT_EMAIL_REQUIRED',
      message: "IoT Studio needs an email address on your Kokoon account, and yours doesn't have one (accounts made with a phone number don't). Please ask your teacher or Kokoon support."
    });
  }
  const name = `${user.name?.firstName ?? ''} ${user.name?.lastName ?? ''}`.replace(/\s+/g, ' ').trim().slice(0, 80);
  return {
    lmsUserId: String(user._id),
    email,
    // Emails come from Google sign-in, which only gives verified addresses
    emailVerified: Boolean(user.googleId),
    name: name || 'Kokoon student'
  };
};

/** A board as the student sees it (never its credentials). */
const view = (b: IIotBoard) => ({
  _id: String(b._id),
  name: b.name,
  board: b.board,
  hardwareId: b.hardwareId,
  // The ESP32 this board is bound to (null until an upload reads it)
  chipId: b.chipId ?? null,
  registered: Boolean(b.deviceId),
  studioUrl: b.studioUrl,
  studioRoute: b.studioUrl ? routeOfStudioUrl(b.studioUrl) : null,
  lastProgram: b.lastProgram,
  lastFlashedAt: b.lastFlashedAt,
  createdAt: b.createdAt
});

const credentialsKey = () => {
  if (!iotStudioConfig.credentialsKey) throw new Error('IOT_CREDENTIALS_KEY missing');
  return iotStudioConfig.credentialsKey;
};

const isDuplicate = (err: unknown) => (err as { code?: number })?.code === 11000;

// IoT Studio's broker details go into the board's code: only accept what they should look like
const checkUpsert = (r: DeviceUpsertResponse, hardwareId: string) => {
  const ok =
    r &&
    typeof r.deviceId === 'string' &&
    r.topicPrefix === `kokoon/devices/${hardwareId}` &&
    r.broker &&
    /^[A-Za-z0-9.-]{1,253}$/.test(String(r.broker.host)) &&
    Number.isInteger(r.broker.port) &&
    r.broker.port > 0 &&
    r.broker.port < 65536 &&
    typeof r.broker.tls === 'boolean' &&
    (r.credentials === null || (typeof r.credentials?.username === 'string' && typeof r.credentials?.password === 'string'));
  if (!ok) {
    logger.warn('IoT Studio sent an unexpected device answer', { hardwareId });
    asLmsError(new IotStudioError(502, 'bad_response', 'IoT Studio sent an answer Kokoon did not understand. Try again later.'));
  }
};

// ── Boards ──────────────────────────────────────────────────────────────────

export const getIotConfigService = () => ({
  enabled: iotStudioConfig.enabled,
  appUrl: iotStudioConfig.enabled ? iotStudioConfig.appUrl : null
});

export const listBoardsService = async (userId: string) => (await iotBoardDao.listForUser(userId)).map(view);

export const createBoardService = async (userId: string, input: { name: string; board: IotBoardType }) => {
  if (!IOT_BOARDS.includes(input.board)) throw new ErrorHandler(400, 'Choose one of the listed board types.', 'IOT_BAD_BOARD');
  if ((await iotBoardDao.countForUser(userId)) >= MAX_BOARDS) {
    throw new ErrorHandler(409, `You can register up to ${MAX_BOARDS} boards. Remove one you no longer use first.`, 'IOT_TOO_MANY_BOARDS');
  }
  // The id is random: on the (very unlikely) clash, draw another
  for (let tries = 0; ; tries++) {
    try {
      return view(await iotBoardDao.create({ userId, name: input.name.trim(), board: input.board, hardwareId: newHardwareId(input.board) }));
    } catch (err) {
      if (!isDuplicate(err) || tries >= 4) throw err;
    }
  }
};

export const renameBoardService = async (userId: string, id: string, name: string) => {
  // IoT Studio gets the new name with the next flash
  const board = await iotBoardDao.updateForUser(userId, id, { name: name.trim() });
  if (!board) throw notFound();
  return view(board);
};

/** Remove a board: IoT Studio switches it off and revokes its credentials first (B3). */
export const removeBoardService = async (userId: string, id: string) => {
  const board = await iotBoardDao.findForUser(userId, id);
  if (!board) throw notFound();
  if (board.deviceId) {
    requireEnabled();
    try {
      await client().deleteDevice(board.hardwareId, { requestId: randomUUID() });
    } catch (err) {
      // Already gone from IoT Studio: nothing left to switch off
      if (!(err instanceof IotStudioError && err.code === 'not_found')) asLmsError(err);
    }
  }
  await iotBoardDao.deleteForUser(userId, id);
  statusCache.invalidate(board.hardwareId);
  return { removed: true };
};

// ── Status ──────────────────────────────────────────────────────────────────

/** One board's state from B2 (only used when IoT Studio has no bulk status endpoint). */
const statusFromB2 = async (hardwareId: string): Promise<IotStatusEntry> => {
  try {
    const { data } = await statusClient().getDevice<DeviceStatusResponse>(hardwareId, { maxRetries: 0, deadlineAt: statusDeadline() });
    return {
      found: true,
      ownerLmsUserId: String(data.ownerLmsUserId),
      connectionState: String(data.connectionState),
      lastSeenAt: typeof data.lastSeenAt === 'number' ? data.lastSeenAt : null,
      studioUrl: data.studioUrl ?? null
    };
  } catch (err) {
    if (err instanceof IotStudioError && err.code === 'not_found') return { found: false };
    throw err;
  }
};

let warnedNoBulkStatus = false;

/** Many boards' state in as few calls as possible (polled: no retries, the next poll is the retry). */
const fetchStatuses = async (hardwareIds: string[]): Promise<Map<string, IotStatusEntry>> => {
  const out = new Map<string, IotStatusEntry>();
  for (let i = 0; i < hardwareIds.length; i += STATUS_BATCH) {
    const chunk = hardwareIds.slice(i, i + STATUS_BATCH);
    try {
      const { data } = await statusClient().getDevicesStatus<BulkStatusResponse>(chunk, { maxRetries: 0, deadlineAt: statusDeadline() });
      for (const [k, v] of mapBulkStatus(chunk, data)) out.set(k, v);
    } catch (err) {
      // An older IoT Studio without POST /devices/status: one B2 per board
      if (!(err instanceof IotStudioError && err.status === 404)) throw err;
      if (!warnedNoBulkStatus) {
        warnedNoBulkStatus = true;
        logger.warn('IoT Studio has no bulk status endpoint (POST /integrations/lms/devices/status): asking per board');
      }
      for (const id of chunk) out.set(id, await statusFromB2(id));
    }
  }
  return out;
};

// Many students' panels poll: each board is asked about at most once per TTL,
// and the boards of polls arriving together go to IoT Studio in one call
const statusCache = createStatusCache<IotStatusEntry>({
  ttlMs: STATUS_TTL_MS,
  maxEntries: STATUS_MAX_ENTRIES,
  fetchMany: createBatcher({ windowMs: STATUS_BATCH_WINDOW_MS, maxKeys: STATUS_BATCH, fetchMany: fetchStatuses })
});

/** The state of every registered board in the list, one IoT Studio call for those not cached. */
const statusesFor = async (boards: IIotBoard[]) => {
  try {
    return await statusCache.getMany(boards.filter(b => b.deviceId).map(b => b.hardwareId));
  } catch (err) {
    return asLmsError(err);
  }
};

/**
 * The board's live status from IoT Studio. "online" only when connected.
 * All of the student's boards are asked about together, so the panel's
 * polls for their other boards are answered from the cache.
 */
export const boardStatusService = async (userId: string, id: string): Promise<BoardStatusView> => {
  const boards = await iotBoardDao.listForUser(userId);
  const board = boards.find(b => String(b._id) === id);
  if (!board) throw notFound();
  if (!board.deviceId) return { ...UNREGISTERED_STATUS };
  requireEnabled();
  const status = boardStatusOf((await statusesFor(boards)).get(board.hardwareId), userId, board.studioUrl);
  if (status === 'owned_by_other_user') {
    return asLmsError(new IotStudioError(409, 'device_owned_by_other_user', 'This board belongs to another student in IoT Studio.'));
  }
  return status;
};

/** The live status of all the student's boards in one go ({ boardId, ...status } each). */
export const allBoardsStatusService = async (userId: string) => {
  const boards = await iotBoardDao.listForUser(userId);
  const anyRegistered = boards.some(b => b.deviceId);
  if (anyRegistered) requireEnabled();
  const statuses = anyRegistered ? await statusesFor(boards) : new Map<string, IotStatusEntry>();
  return {
    statuses: boards.map(b => {
      const status = b.deviceId ? boardStatusOf(statuses.get(b.hardwareId), userId, b.studioUrl) : { ...UNREGISTERED_STATUS };
      return status === 'owned_by_other_user'
        ? { boardId: String(b._id), ...UNREGISTERED_STATUS, errorCode: 'IOT_DEVICE_OWNED_BY_OTHER_USER' }
        : { boardId: String(b._id), ...status };
    })
  };
};

// ── Flashing ────────────────────────────────────────────────────────────────

export interface FlashInput {
  programId: string;
  version: string;
  variables: unknown;
  // The plugged-in ESP32 (lowercase hex), when the editor could read it
  chipId?: string | null;
  // Move this board to that chip (after IOT_CHIP_MISMATCH)
  replaceChip?: boolean;
}

const storeUpsert = async (userId: string, board: IIotBoard, r: DeviceUpsertResponse, extra: Partial<IIotBoard>) => {
  const set: Partial<IIotBoard> = {
    deviceId: r.deviceId,
    studioUrl: r.studioUrl ?? null,
    topicPrefix: r.topicPrefix,
    broker: { host: r.broker.host, port: r.broker.port, tls: r.broker.tls },
    ...extra
  };
  if (r.projectId) set.projectId = r.projectId;
  if (r.credentials) set.credentials = seal(credentialsKey(), r.credentials);
  return await iotBoardDao.updateForUser(userId, String(board._id), set);
};

/** A flash's IoT Studio error; "chip in use" names the student's own board when it is theirs. */
const flashError = async (err: unknown, userId: string): Promise<never> => {
  if (err instanceof IotStudioError && err.code === 'chip_in_use' && err.otherHardwareId) {
    const theirs = (await iotBoardDao.listForUser(userId)).find(b => b.hardwareId === err.otherHardwareId);
    if (theirs) {
      return asLmsError(err, `The ESP32 that is plugged in is already your board "${theirs.name}". Pick that board on the Connect block instead.`);
    }
  }
  return asLmsError(err);
};

/**
 * Get a board ready for a program with the IoT Studio blocks (B1 with
 * project.create): registers it or updates its variables, keeps the
 * credentials IoT Studio gives, and returns what the board's secrets file
 * needs. If anything fails nothing should be flashed.
 * When B1 would send exactly what last succeeded, the kept answer is used
 * and IoT Studio is not called (most Runs change nothing).
 */
export const prepareFlashService = async (userId: string, id: string, input: FlashInput) => {
  requireEnabled();
  return await withBoardLock(userId, id, async () => {
    const deadlineAt = Date.now() + FLASH_IOT_DEADLINE_MS;
    const board = await iotBoardDao.findForUser(userId, id, true);
    if (!board) throw notFound();
    const project = await projectDao.findByUserAndId(userId, input.programId);
    if (!project) {
      throw new ErrorHandler(404, 'Save your project first, then upload it again.', 'IOT_PROJECT_NOT_FOUND');
    }
    const checked = checkVariables(input.variables);
    if ('problem' in checked) throw new ErrorHandler(400, `IoT variables: ${checked.problem}.`, 'IOT_BAD_VARIABLES');
    const chipId = input.chipId ?? null;
    const replaceChip = Boolean(input.replaceChip && chipId);
    // Bound to another ESP32 here already: only "Replace" moves it (IoT Studio checks this too)
    if (chipId && board.chipId && board.chipId !== chipId && !replaceChip) {
      return asLmsError(new IotStudioError(409, 'chip_mismatch', studentMessageFor(409, 'chip_mismatch')));
    }

    const program = { programId: String(project._id), name: (project.title || 'Untitled Project').slice(0, 120), version: input.version };
    const body = {
      user: await identityOf(userId),
      // chipId only when the editor read it: without it B1 is as before
      device: { name: board.name, board: board.board, firmwareVersion: input.version, ...(chipId ? { chipId } : {}) },
      program,
      variables: checked.variables,
      project: { create: true }
    };
    const hash = upsertHash(iotStudioConfig.apiUrl, board.hardwareId, body);
    // A login that can't be read (e.g. IOT_CREDENTIALS_KEY changed) counts as none kept
    const stored = tryUnseal<MqttLogin>(iotStudioConfig.credentialsKey, board.credentials);
    if (board.credentials && !stored) {
      logger.warn('IoT Studio: a board login could not be read with IOT_CREDENTIALS_KEY; asking for a new one', { hardwareId: board.hardwareId });
    }

    const kept = board.topicPrefix && board.broker?.host ? { topicPrefix: board.topicPrefix, broker: board.broker } : null;
    const skip = canSkipUpsert({
      hash,
      storedHash: board.syncHash,
      lastSyncedAt: board.lastSyncedAt,
      registered: Boolean(board.deviceId),
      hasConnection: Boolean(kept),
      credentialsOk: Boolean(stored),
      hasProject: Boolean(board.projectId),
      // Removed, switched off or moved in IoT Studio: only B1 fixes that
      knownChanged: statusNeedsUpsert(statusCache.peek(board.hardwareId), userId),
      replaceChip,
      nowMs: Date.now()
    });
    if (skip && kept && stored) {
      const saved = await iotBoardDao.updateForUser(userId, id, { lastFlashedAt: new Date() });
      return flashAnswer(saved ?? board, kept.topicPrefix, kept.broker, stored, board.projectId, board.studioUrl, []);
    }

    let outcome: { result: DeviceUpsertResponse; credentials: MqttLogin | null };
    try {
      outcome = await upsertForFlash<DeviceUpsertResponse>({
        registered: Boolean(board.deviceId),
        stored,
        replaceChip,
        call: async opts => {
          const r = (await client().upsertDevice<DeviceUpsertResponse>(board.hardwareId, body, { ...opts, requestId: randomUUID(), deadlineAt })).data;
          checkUpsert(r, board.hardwareId);
          return r;
        }
      });
    } catch (err) {
      return await flashError(err, userId);
    }
    const { result, credentials } = outcome;
    if (!credentials) {
      return asLmsError(new IotStudioError(502, 'bad_response', 'IoT Studio did not give this board its login. Try again.'));
    }

    const now = new Date();
    const saved = await storeUpsert(userId, board, result, {
      lastProgram: program,
      lastVariables: checked.variables,
      lastFlashedAt: now,
      // After a warning (no project, variables dropped) the next Run asks again
      syncHash: upsertComplete(result) ? hash : null,
      lastSyncedAt: now,
      ...(chipId ? { chipId } : {})
    });
    statusCache.invalidate(board.hardwareId);
    return flashAnswer(saved ?? board, result.topicPrefix, result.broker, credentials, result.projectId, result.studioUrl, result.warnings ?? []);
  });
};

/** What the editor needs to write the board's secrets file. */
const flashAnswer = (
  board: IIotBoard,
  topicPrefix: string,
  broker: { host: string; port: number; tls: boolean },
  credentials: MqttLogin,
  projectId: string | null,
  studioUrl: string | null,
  warnings: string[]
) => ({
  board: view(board),
  hardwareId: board.hardwareId,
  // KOKOON_CHIP_ID: the board refuses to connect on another ESP32 (null: not known yet)
  chipId: board.chipId ?? null,
  topicPrefix,
  broker: { host: broker.host, port: broker.port, tls: broker.tls },
  // Only for writing the board's secrets file; never saved with the program
  credentials,
  // Board checks the broker's certificate with this (null: none configured)
  caPem: broker.tls ? iotStudioConfig.mqttCaPem : null,
  projectId,
  studioRoute: routeOfStudioUrl(studioUrl),
  warnings: warnings.map(code => ({ code, message: warningMessage(code) }))
});

/**
 * "Reset connection": IoT Studio gives the board a new password (B1 with
 * rotateCredentials). The board needs the program uploaded again to use it.
 */
export const resetBoardService = async (userId: string, id: string) => {
  requireEnabled();
  return await withBoardLock(userId, id, async () => {
    const board = await iotBoardDao.findForUser(userId, id, true);
    if (!board) throw notFound();
    if (!board.deviceId || !board.lastProgram) {
      throw new ErrorHandler(409, 'This board is not connected to IoT Studio yet: upload a program with the IoT Studio blocks first.', 'IOT_NOT_REGISTERED');
    }
    const body = {
      user: await identityOf(userId),
      device: { name: board.name, board: board.board, ...(board.lastProgram.version ? { firmwareVersion: board.lastProgram.version } : {}) },
      program: board.lastProgram,
      variables: board.lastVariables ?? [],
      project: { create: false }
    };
    try {
      const { data } = await client().upsertDevice<DeviceUpsertResponse>(board.hardwareId, body, {
        rotateCredentials: true,
        requestId: randomUUID(),
        deadlineAt: Date.now() + FLASH_IOT_DEADLINE_MS
      });
      checkUpsert(data, board.hardwareId);
      if (!data.credentials) {
        asLmsError(new IotStudioError(502, 'bad_response', 'IoT Studio did not give this board a new login. Try again.'));
      }
      const saved = await storeUpsert(userId, board, data, {});
      statusCache.invalidate(board.hardwareId);
      return { board: view(saved ?? board), warnings: (data.warnings ?? []).map(code => ({ code, message: warningMessage(code) })) };
    } catch (err) {
      return asLmsError(err);
    }
  });
};

// ── SSO ─────────────────────────────────────────────────────────────────────

/** A fresh 60-second token for one "Open in IoT Studio" click (the browser posts it, never in a URL). */
export const ssoTokenService = async (userId: string, next: unknown) => {
  requireEnabled();
  return {
    action: `${iotStudioConfig.apiUrl}/auth/lms/sso`,
    token: mintSsoToken(iotStudioConfig.ssoSecret, await identityOf(userId)),
    next: sanitizeNext(next)
  };
};

// ── Startup check ───────────────────────────────────────────────────────────

/**
 * One signed B2 for a board that never exists: IoT Studio answering 404
 * not_found proves the URL (host, port, API base path) and LMS_API_SECRET
 * together. Only logs; never throws, never holds up the start.
 */
export const iotStudioSelfCheck = async (): Promise<void> => {
  if (!iotStudioConfig.enabled) return;
  let where = 'IOT_STUDIO_API_URL';
  try {
    const u = new URL(iotStudioConfig.apiUrl);
    // No user:password@ or query in the log
    where = `${u.origin}${u.pathname}`;
  } catch {
    // keep the name only
  }
  let failure: unknown = null;
  try {
    await client().getDevice(SELF_CHECK_HARDWARE_ID, { maxRetries: 0 });
  } catch (err) {
    failure = err;
  }
  try {
    const verdict = selfCheckVerdict(failure, where);
    if (verdict.ok) logger.info(verdict.message);
    else logger.error(verdict.message);
  } catch {
    // a log line is not worth a crash
  }
};
