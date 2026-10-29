import { randomUUID } from 'crypto';
import ErrorHandler from '../../utils/error-handler';
import logger from '../../config/logger';
import { iotStudioConfig } from '../../config/iot-studio.config';
import { iotBoardDao } from '../../dao/iot-board.dao';
import { userDao } from '../../dao/user.dao';
import { ProjectDao } from '../../dao/project.dao';
import { IIotBoard } from '../../interfaces/iot-board.interface';
import { seal, unseal } from '../../utils/iot-crypto';
import { IotStudioError, createIotStudioClient, warningMessage } from '../../utils/iot-studio-client';
import {
  IOT_BOARDS,
  IotBoardType,
  IotVariable,
  LmsIdentity,
  checkVariables,
  mintSsoToken,
  newHardwareId,
  routeOfStudioUrl,
  sanitizeNext
} from '../../utils/iot-studio';

// Kokoon IoT Studio for students: their boards ("My boards"), getting a
// board ready to flash (contract B1), its live status (B2), removing it (B3)
// and signing in to IoT Studio (SSO, contract A).

const MAX_BOARDS = 20;
const projectDao = new ProjectDao();

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
  credentials: { username: string; password: string } | null;
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

const client = () =>
  createIotStudioClient({
    baseUrl: iotStudioConfig.apiUrl,
    secret: iotStudioConfig.apiSecret,
    // Only what's needed to find the problem in IoT Studio's logs
    onFailure: info => logger.warn('IoT Studio request failed', info)
  });

/** An IoT Studio error as the LMS's own error, with the message for the student. */
const asLmsError = (err: unknown): never => {
  if (!(err instanceof IotStudioError)) throw err;
  const byCode: Record<string, number> = {
    validation_failed: 422,
    device_owned_by_other_user: 409,
    user_disabled: 403,
    not_found: 404,
    integration_disabled: 503,
    rate_limited: 503,
    request_in_progress: 503,
    unavailable: 503
  };
  const statusCode = byCode[err.code] ?? 502;
  const out = new ErrorHandler({ statusCode, errorCode: `IOT_${err.code.toUpperCase()}`, message: err.studentMessage });
  out.expose = true;
  throw out;
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
  return { removed: true };
};

/** The board's live status from IoT Studio (B2). "online" only when connected. */
export const boardStatusService = async (userId: string, id: string) => {
  const board = await iotBoardDao.findForUser(userId, id);
  if (!board) throw notFound();
  if (!board.deviceId) return { registered: false, online: false, connectionState: null, lastSeenAt: null, studioRoute: null };
  requireEnabled();
  try {
    // Polled every few seconds: no retries here, the next poll is the retry
    const { data } = await client().getDevice<DeviceStatusResponse>(board.hardwareId, { maxRetries: 0 });
    if (String(data.ownerLmsUserId) !== String(userId)) {
      asLmsError(new IotStudioError(409, 'device_owned_by_other_user', 'This board belongs to another student in IoT Studio.'));
    }
    return {
      registered: true,
      online: data.connectionState === 'connected',
      connectionState: data.connectionState,
      // unix milliseconds or null
      lastSeenAt: typeof data.lastSeenAt === 'number' ? data.lastSeenAt : null,
      studioRoute: routeOfStudioUrl(data.studioUrl ?? board.studioUrl)
    };
  } catch (err) {
    if (err instanceof IotStudioError && err.code === 'not_found') {
      return { registered: false, online: false, connectionState: null, lastSeenAt: null, studioRoute: null };
    }
    return asLmsError(err);
  }
};

// ── Flashing ────────────────────────────────────────────────────────────────

export interface FlashInput {
  programId: string;
  version: string;
  variables: unknown;
}

const storeUpsert = async (userId: string, board: IIotBoard, r: DeviceUpsertResponse, extra: Partial<IIotBoard>) => {
  const set: Partial<IIotBoard> = { deviceId: r.deviceId, studioUrl: r.studioUrl ?? null, ...extra };
  if (r.credentials) set.credentials = seal(credentialsKey(), r.credentials);
  return await iotBoardDao.updateForUser(userId, String(board._id), set);
};

/**
 * Get a board ready for a program with the IoT Studio blocks (B1 with
 * project.create): registers it or updates its variables, keeps the
 * credentials IoT Studio gives, and returns what the board's secrets file
 * needs. If anything fails nothing should be flashed.
 */
export const prepareFlashService = async (userId: string, id: string, input: FlashInput) => {
  requireEnabled();
  const board = await iotBoardDao.findForUser(userId, id, true);
  if (!board) throw notFound();
  const project = await projectDao.findByUserAndId(userId, input.programId);
  if (!project) {
    throw new ErrorHandler(404, 'Save your project first, then upload it again.', 'IOT_PROJECT_NOT_FOUND');
  }
  const checked = checkVariables(input.variables);
  if ('problem' in checked) throw new ErrorHandler(400, `IoT variables: ${checked.problem}.`, 'IOT_BAD_VARIABLES');

  const program = { programId: String(project._id), name: (project.title || 'Untitled Project').slice(0, 120), version: input.version };
  const body = {
    user: await identityOf(userId),
    device: { name: board.name, board: board.board, firmwareVersion: input.version },
    program,
    variables: checked.variables,
    project: { create: true }
  };

  const api = client();
  let result: DeviceUpsertResponse;
  try {
    result = (await api.upsertDevice<DeviceUpsertResponse>(board.hardwareId, body, { requestId: randomUUID() })).data;
    checkUpsert(result, board.hardwareId);
    // No credentials now and none kept (e.g. lost): ask for new ones
    if (!result.credentials && !board.credentials) {
      result = (await api.upsertDevice<DeviceUpsertResponse>(board.hardwareId, body, { rotateCredentials: true, requestId: randomUUID() })).data;
      checkUpsert(result, board.hardwareId);
    }
  } catch (err) {
    return asLmsError(err);
  }

  const saved = await storeUpsert(userId, board, result, {
    lastProgram: program,
    lastVariables: checked.variables,
    lastFlashedAt: new Date()
  });
  const credentials = result.credentials ?? (board.credentials ? unseal<{ username: string; password: string }>(credentialsKey(), board.credentials) : null);
  if (!credentials) {
    asLmsError(new IotStudioError(502, 'bad_response', 'IoT Studio did not give this board its login. Try again.'));
  }

  return {
    board: saved ? view(saved) : view(board),
    hardwareId: board.hardwareId,
    topicPrefix: result.topicPrefix,
    broker: { host: result.broker.host, port: result.broker.port, tls: result.broker.tls },
    // Only for writing the board's secrets file; never saved with the program
    credentials,
    // Board checks the broker's certificate with this (null: none configured)
    caPem: result.broker.tls ? iotStudioConfig.mqttCaPem : null,
    projectId: result.projectId,
    studioRoute: routeOfStudioUrl(result.studioUrl),
    warnings: (result.warnings ?? []).map(code => ({ code, message: warningMessage(code) }))
  };
};

/**
 * "Reset connection": IoT Studio gives the board a new password (B1 with
 * rotateCredentials). The board needs the program uploaded again to use it.
 */
export const resetBoardService = async (userId: string, id: string) => {
  requireEnabled();
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
    const { data } = await client().upsertDevice<DeviceUpsertResponse>(board.hardwareId, body, { rotateCredentials: true, requestId: randomUUID() });
    checkUpsert(data, board.hardwareId);
    if (!data.credentials) {
      asLmsError(new IotStudioError(502, 'bad_response', 'IoT Studio did not give this board a new login. Try again.'));
    }
    const saved = await storeUpsert(userId, board, data, {});
    return { board: view(saved ?? board), warnings: (data.warnings ?? []).map(code => ({ code, message: warningMessage(code) })) };
  } catch (err) {
    return asLmsError(err);
  }
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
