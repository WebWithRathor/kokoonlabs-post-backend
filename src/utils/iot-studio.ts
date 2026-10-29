import { randomInt, randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';

// Kokoon IoT Studio integration helpers (contract v1): board ids, the SSO
// token, where SSO may land, and the variables a program declares.

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
