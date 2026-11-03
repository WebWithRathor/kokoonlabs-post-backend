import { createHash, randomInt, randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';

// Kokoon IoT Studio integration helpers (contract v1): board ids, the SSO
// token, where SSO may land, the variables a program declares, the chip a
// board is bound to, when a flash can skip B1, and the board status cache.

// ── Boards ───────────────────────────────────────────────────────────────────

export const IOT_BOARDS = ['ESP32-S3 DevKitC', 'ESP32-C3 Mini', 'Kokoon BrainBoard', 'ESP32 WROOM-32'] as const;
export type IotBoardType = (typeof IOT_BOARDS)[number];

const BOARD_SLUGS: Record<IotBoardType, string> = {
  'ESP32-S3 DevKitC': 'esp32s3',
  'ESP32-C3 Mini': 'esp32c3',
  'Kokoon BrainBoard': 'brainboard',
  'ESP32 WROOM-32': 'esp32wroom'
};

// Crockford base32, lowercase (no i, l, o, u): readable, never "sandbox-" / "esp32-sim-"
const BASE32 = '0123456789abcdefghjkmnpqrstvwxyz';
export const HARDWARE_ID_RE = /^[a-z0-9][a-z0-9-]{2,47}$/;

/** "kk-<boardslug>-<8 random characters>", e.g. kk-esp32s3-7f3k9q2m. Made once per physical board. */
export const newHardwareId = (board: IotBoardType): string =>
  `kk-${BOARD_SLUGS[board]}-${Array.from({ length: 8 }, () => BASE32[randomInt(BASE32.length)]).join('')}`;

// The ESP32 a board record runs on: machine.unique_id() as lowercase hex.
// IoT Studio binds each board to one chip (B1 device.chipId).
export const CHIP_ID_RE = /^[0-9a-f]{8,32}$/;

// ── SSO (contract A) ─────────────────────────────────────────────────────────

export const SSO_TOKEN_SECONDS = 60;

export interface LmsIdentity {
  lmsUserId: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

/** A fresh HS256 token for one click (new jti every time, lives 60 s). */
export const mintSsoToken = (secret: string, who: LmsIdentity, nowSec = Math.floor(Date.now() / 1000)): string =>
  jwt.sign(
    {
      iss: 'kokoon-lms',
      aud: 'kokoon-iot-studio',
      sub: who.lmsUserId,
      email: who.email,
      email_verified: who.emailVerified,
      name: who.name,
      jti: randomUUID(),
      iat: nowSec,
      exp: nowSec + SSO_TOKEN_SECONDS
    },
    secret,
    // jsonwebtoken keeps the iat given in the payload
    { algorithm: 'HS256' }
  );

/** Where IoT Studio should open after SSO: a route starting with "/" and without "//" (else "/"). */
export const sanitizeNext = (next: unknown): string => {
  if (typeof next !== 'string') return '/';
  const n = next.trim();
  if (!n.startsWith('/') || n.includes('//') || n.length > 200 || /[\s\u0000-\u001f\u007f\\#?]/.test(n)) return '/';
  return n;
};

/** The route part (after "#") of a studioUrl such as http://app/#/devices/abc. */
export const routeOfStudioUrl = (studioUrl?: string | null): string => {
  const hash = (studioUrl ?? '').split('#')[1] ?? '';
  return sanitizeNext(hash || '/');
};

// ── Declared variables (contract B1 "variables") ─────────────────────────────

export const IOT_DATA_TYPES = ['boolean', 'integer', 'float', 'string', 'color', 'json'] as const;
export const IOT_DIRECTIONS = ['telemetry', 'command', 'bidirectional'] as const;
export const MAX_IOT_VARIABLES = 30;
export const IOT_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

export interface IotVariable {
  key: string;
  displayName: string;
  dataType: (typeof IOT_DATA_TYPES)[number];
  direction: (typeof IOT_DIRECTIONS)[number];
  unit?: string;
  min?: number;
  max?: number;
  blockId: string;
}

const clean = (v: unknown, max: number) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);

/**
 * The variables as IoT Studio accepts them, or the first problem found
 * (the editor already blocks these; this is the server's own check).
 */
export const checkVariables = (input: unknown): { variables: IotVariable[] } | { problem: string } => {
  if (!Array.isArray(input)) return { problem: 'variables must be a list' };
  if (input.length > MAX_IOT_VARIABLES) return { problem: `a program can declare at most ${MAX_IOT_VARIABLES} IoT variables` };
  const seen = new Set<string>();
  const out: IotVariable[] = [];
  for (const raw of input as Record<string, unknown>[]) {
    const key = String(raw?.key ?? '');
    if (!IOT_KEY_RE.test(key)) return { problem: `"${clean(key, 40)}" is not a valid IoT variable key` };
    if (seen.has(key)) return { problem: `"${key}" is declared twice` };
    seen.add(key);
    const dataType = String(raw.dataType) as IotVariable['dataType'];
    const direction = String(raw.direction) as IotVariable['direction'];
    if (!IOT_DATA_TYPES.includes(dataType)) return { problem: `"${key}" has an unknown type` };
    if (!IOT_DIRECTIONS.includes(direction)) return { problem: `"${key}" has an unknown direction` };
    const v: IotVariable = {
      key,
      displayName: clean(raw.displayName, 60) || key,
      dataType,
      direction,
      blockId: clean(raw.blockId, 128)
    };
    if (!v.blockId) return { problem: `"${key}" has no block id` };
    // Unit, min and max only mean something for numbers
    if (dataType === 'integer' || dataType === 'float') {
      const unit = clean(raw.unit, 16);
      if (unit) v.unit = unit;
      for (const k of ['min', 'max'] as const) {
        if (raw[k] === undefined || raw[k] === null || raw[k] === '') continue;
        const n = Number(raw[k]);
        if (!Number.isFinite(n)) return { problem: `"${key}" ${k} must be a number` };
        v[k] = n;
      }
      if (v.min !== undefined && v.max !== undefined && v.min > v.max) return { problem: `"${key}" min must not be more than max` };
    }
    out.push(v);
  }
  return { variables: out };
};

// ── Flashing: skip B1 when nothing changed ───────────────────────────────────

export interface MqttLogin {
  username: string;
  password: string;
}

// Even when nothing changed, B1 runs again after this long (picks up broker changes)
export const UPSERT_SKIP_MAX_AGE_MS = 6 * 60 * 60 * 1000;

// Same value, same text: object keys sorted at every level
const stable = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .map(k => [k, stable(o[k])])
    );
  }
  return v;
};

/** Fingerprint of a B1 call: which IoT Studio, which board, and everything the body says. */
export const upsertHash = (apiUrl: string, hardwareId: string, body: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(stable({ apiUrl, hardwareId, body })), 'utf8')
    .digest('hex');

/**
 * A flash may reuse the last B1 answer only when B1 would send exactly the
 * same thing, it succeeded recently, the board is still known to IoT Studio
 * as it was, it has its project, and the stored login and broker details
 * are all usable.
 */
export const canSkipUpsert = (c: {
  hash: string;
  storedHash: string | null | undefined;
  lastSyncedAt: Date | null | undefined;
  registered: boolean;
  // topicPrefix and broker were kept from the last B1
  hasConnection: boolean;
  // the kept login unsealed fine
  credentialsOk: boolean;
  // the last B1 gave the board a project
  hasProject: boolean;
  // the status cache says IoT Studio's board changed since (see statusNeedsUpsert)
  knownChanged: boolean;
  replaceChip: boolean;
  nowMs: number;
}): boolean =>
  c.registered &&
  c.hasConnection &&
  c.credentialsOk &&
  c.hasProject &&
  !c.knownChanged &&
  !c.replaceChip &&
  !!c.storedHash &&
  c.storedHash === c.hash &&
  !!c.lastSyncedAt &&
  c.nowMs - c.lastSyncedAt.getTime() >= 0 &&
  c.nowMs - c.lastSyncedAt.getTime() < UPSERT_SKIP_MAX_AGE_MS;

/**
 * B1 did all it was asked (project made, no variable dropped). Only then is
 * its fingerprint kept: after a warning the next Run calls B1 again, so a
 * project held back for tokens or the plan's limit is made once it can be.
 */
export const upsertComplete = (r: { projectId: string | null; warnings?: string[] }): boolean =>
  Boolean(r.projectId) && !r.warnings?.length;

/**
 * The cached status says only B1 can put this board right: IoT Studio
 * removed it, switched it off (its login is revoked; B1 turns it back on
 * with a new one), or it now has another owner (B1 says so). No entry:
 * nothing known, B1 can still be skipped.
 */
export const statusNeedsUpsert = (entry: IotStatusEntry | undefined, userId: string): boolean =>
  !!entry && (!entry.found || entry.connectionState === 'disabled' || entry.ownerLmsUserId !== String(userId));

/**
 * B1 for a flash, asking for a new login when the board has no usable one
 * (never kept, lost, or the key to read it changed) or was moved to a new
 * chip. Each call() must use a new Request-Id: these are different actions.
 */
export const upsertForFlash = async <R extends { credentials: MqttLogin | null }>(o: {
  registered: boolean;
  // the kept login, or null when there is none or it can't be read
  stored: MqttLogin | null;
  replaceChip: boolean;
  call: (opts: { rotateCredentials: boolean; replaceChip: boolean }) => Promise<R>;
}): Promise<{ result: R; credentials: MqttLogin | null }> => {
  // Known to IoT Studio but nothing usable kept: rotate straight away (replaceChip rotates anyway)
  const rotateFirst = o.registered && !o.stored && !o.replaceChip;
  let result = await o.call({ rotateCredentials: rotateFirst, replaceChip: o.replaceChip });
  // The old login must not be reused after a chip replacement
  if (!result.credentials && !rotateFirst && (o.replaceChip || !o.stored)) {
    result = await o.call({ rotateCredentials: true, replaceChip: false });
  }
  return { result, credentials: result.credentials ?? (o.replaceChip ? null : o.stored) };
};

// ── Board status (bulk status endpoint) ──────────────────────────────────────

/** One board as the bulk status endpoint describes it, or not known to IoT Studio. */
export type IotStatusEntry =
  | { found: true; ownerLmsUserId: string; connectionState: string; lastSeenAt: number | null; studioUrl: string | null }
  | { found: false };

export interface BulkStatusResponse {
  devices?: { hardwareId?: unknown; ownerLmsUserId?: unknown; connectionState?: unknown; lastSeenAt?: unknown; studioUrl?: unknown }[];
  missing?: unknown[];
}

/** The bulk answer per hardwareId. Only ids that were asked for; ids in neither list are left out. */
export const mapBulkStatus = (asked: string[], res: BulkStatusResponse | null): Map<string, IotStatusEntry> => {
  const want = new Set(asked);
  const out = new Map<string, IotStatusEntry>();
  for (const d of Array.isArray(res?.devices) ? res.devices : []) {
    const id = typeof d?.hardwareId === 'string' ? d.hardwareId : '';
    if (!want.has(id) || typeof d.connectionState !== 'string') continue;
    out.set(id, {
      found: true,
      ownerLmsUserId: String(d.ownerLmsUserId ?? ''),
      connectionState: d.connectionState,
      lastSeenAt: typeof d.lastSeenAt === 'number' ? d.lastSeenAt : null,
      studioUrl: typeof d.studioUrl === 'string' ? d.studioUrl : null
    });
  }
  for (const id of Array.isArray(res?.missing) ? res.missing : []) {
    if (typeof id === 'string' && want.has(id) && !out.has(id)) out.set(id, { found: false });
  }
  return out;
};

export interface BoardStatusView {
  registered: boolean;
  online: boolean;
  connectionState: string | null;
  // unix milliseconds or null
  lastSeenAt: number | null;
  studioRoute: string | null;
}

export const UNREGISTERED_STATUS: Readonly<BoardStatusView> = Object.freeze({
  registered: false,
  online: false,
  connectionState: null,
  lastSeenAt: null,
  studioRoute: null
});

/** What the student sees for one board ("online" only when connected), or that it is someone else's. */
export const boardStatusOf = (
  entry: IotStatusEntry | undefined,
  userId: string,
  storedStudioUrl: string | null
): BoardStatusView | 'owned_by_other_user' => {
  if (!entry || !entry.found) return { ...UNREGISTERED_STATUS };
  if (entry.ownerLmsUserId !== String(userId)) return 'owned_by_other_user';
  return {
    registered: true,
    online: entry.connectionState === 'connected',
    connectionState: entry.connectionState,
    lastSeenAt: entry.lastSeenAt,
    studioRoute: routeOfStudioUrl(entry.studioUrl ?? storedStudioUrl)
  };
};

/**
 * Merges the keys of calls made within `windowMs` of each other into one
 * `fetchMany` of at most `maxKeys` keys, so a classroom of panels polling at
 * the same moment makes one IoT Studio call instead of one per student. Each
 * caller gets the answers for its own keys; a failed fetch fails only the
 * callers that were in it.
 */
export const createBatcher = <V>(o: { windowMs: number; maxKeys: number; fetchMany: (keys: string[]) => Promise<Map<string, V>> }) => {
  type Waiter = { keys: string[]; resolve: (m: Map<string, V>) => void; reject: (err: unknown) => void };
  let waiters: Waiter[] = [];
  let queued = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const batch = waiters;
    const keys = [...queued];
    waiters = [];
    queued = new Set();
    if (!batch.length) return;
    o.fetchMany(keys).then(
      m => {
        for (const w of batch) w.resolve(new Map(w.keys.filter(k => m.has(k)).map(k => [k, m.get(k) as V])));
      },
      err => {
        for (const w of batch) w.reject(err);
      }
    );
  };

  return (keys: string[]): Promise<Map<string, V>> => {
    const own = [...new Set(keys)];
    if (!own.length) return Promise.resolve(new Map());
    // Too many for one batch: on its own (fetchMany splits it)
    if (own.length >= o.maxKeys) return o.fetchMany(own);
    if (queued.size + own.filter(k => !queued.has(k)).length > o.maxKeys) flush();
    return new Promise<Map<string, V>>((resolve, reject) => {
      waiters.push({ keys: own, resolve, reject });
      for (const k of own) queued.add(k);
      if (queued.size >= o.maxKeys) flush();
      else timer ??= setTimeout(flush, o.windowMs);
    });
  };
};

/**
 * A short-lived, size-capped cache in front of a "fetch many" call. Keys
 * already being fetched are waited for, not fetched again, so concurrent
 * polls for the same boards make one call. Failures are not cached.
 * In memory: each server process has its own.
 */
export const createStatusCache = <V>(o: {
  ttlMs: number;
  maxEntries: number;
  fetchMany: (keys: string[]) => Promise<Map<string, V>>;
  nowMs?: () => number;
}) => {
  const now = o.nowMs ?? (() => Date.now());
  const entries = new Map<string, { value: V; at: number }>();
  const inflight = new Map<string, Promise<Map<string, V>>>();

  const fresh = (key: string) => {
    const e = entries.get(key);
    if (!e) return undefined;
    if (now() - e.at >= o.ttlMs) {
      entries.delete(key);
      return undefined;
    }
    return e;
  };
  const put = (key: string, value: V) => {
    entries.delete(key);
    entries.set(key, { value, at: now() });
    // Oldest first out
    while (entries.size > o.maxEntries) entries.delete(entries.keys().next().value as string);
  };

  return {
    /** Values for the keys that have one (a key the fetch did not answer is left out). */
    getMany: async (keys: string[]): Promise<Map<string, V>> => {
      const out = new Map<string, V>();
      const waits: Promise<void>[] = [];
      const toFetch: string[] = [];
      for (const key of new Set(keys)) {
        const hit = fresh(key);
        if (hit) out.set(key, hit.value);
        else if (inflight.has(key)) {
          waits.push(
            inflight.get(key)!.then(m => {
              if (m.has(key)) out.set(key, m.get(key) as V);
            })
          );
        } else toFetch.push(key);
      }
      if (toFetch.length) {
        const p = o.fetchMany(toFetch).then(m => {
          // Not kept when invalidated while on the way
          for (const [k, v] of m) if (inflight.get(k) === p) put(k, v);
          return m;
        });
        for (const k of toFetch) inflight.set(k, p);
        const settled = p.finally(() => {
          for (const k of toFetch) if (inflight.get(k) === p) inflight.delete(k);
        });
        waits.push(
          settled.then(m => {
            for (const k of toFetch) if (m.has(k)) out.set(k, m.get(k) as V);
          })
        );
      }
      await Promise.all(waits);
      return out;
    },
    /** Forget a key (e.g. right after a flash, so the next poll asks IoT Studio). */
    invalidate: (key: string) => {
      entries.delete(key);
      inflight.delete(key);
    },
    /** The cached value, without fetching. */
    peek: (key: string): V | undefined => fresh(key)?.value,
    get size() {
      return entries.size;
    }
  };
};
