import { readFileSync } from 'fs';
import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

// Same .env as config.ts (whichever module is imported first loads it)
dotenvConfig({ quiet: true });

// Kokoon IoT Studio integration (docs: the LMS ↔ IoT Studio contract v1).
// Everything here stays on the server. Only the two URLs may reach a browser.
//
//   IOT_INTEGRATION_ENABLED   "true" to switch the integration on
//   IOT_STUDIO_API_URL        IoT Studio API base, e.g. http://localhost:4000/api/v1
//   IOT_STUDIO_APP_URL        IoT Studio app, e.g. http://localhost:5173
//   LMS_SSO_SECRET            HS256 key for SSO tokens (≥48 chars)
//   LMS_API_SECRET            HMAC key for server-to-server calls (≥48 chars, different)
//   IOT_CREDENTIALS_KEY       32 bytes (64 hex chars or base64) encrypting boards' MQTT passwords
//   IOT_STUDIO_MQTT_CA_FILE   optional: PEM file of the broker's CA, for boards on a TLS broker

const SECRET_MIN = 48;

const url = (name: string) =>
  z
    .string()
    .trim()
    .url(`${name} must be a URL`)
    .refine(u => /^https?:\/\//.test(u), `${name} must start with http:// or https://`)
    .transform(u => u.replace(/\/+$/, ''));

/** 32 bytes from 64 hex characters or base64; null if it isn't that. */
export const parseKey = (raw: string): Buffer | null => {
  const s = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, 'hex');
  try {
    const b = Buffer.from(s, 'base64');
    return b.length === 32 ? b : null;
  } catch {
    return null;
  }
};

export interface IotStudioConfig {
  enabled: boolean;
  apiUrl: string;
  appUrl: string;
  ssoSecret: string;
  apiSecret: string;
  credentialsKey: Buffer | null;
  // PEM text of the broker's CA (null: none configured)
  mqttCaPem: string | null;
}

const schema = z
  .object({
    IOT_INTEGRATION_ENABLED: z.string().optional(),
    IOT_STUDIO_API_URL: z.string().optional(),
    IOT_STUDIO_APP_URL: z.string().optional(),
    LMS_SSO_SECRET: z.string().optional(),
    LMS_API_SECRET: z.string().optional(),
    IOT_CREDENTIALS_KEY: z.string().optional(),
    IOT_STUDIO_MQTT_CA_FILE: z.string().optional(),
    NODE_ENV: z.string().optional()
  })
  .superRefine((env, ctx) => {
    if (env.IOT_INTEGRATION_ENABLED !== 'true') return;
    const need = (key: keyof typeof env, ok: boolean, message: string) => {
      if (!ok) ctx.addIssue({ code: 'custom', path: [key], message });
    };
    for (const key of ['IOT_STUDIO_API_URL', 'IOT_STUDIO_APP_URL'] as const) {
      const parsed = url(key).safeParse(env[key] ?? '');
      need(key, parsed.success, parsed.success ? '' : parsed.error.issues[0].message);
    }
    need('LMS_SSO_SECRET', (env.LMS_SSO_SECRET ?? '').length >= SECRET_MIN, `LMS_SSO_SECRET must be at least ${SECRET_MIN} characters`);
    need('LMS_API_SECRET', (env.LMS_API_SECRET ?? '').length >= SECRET_MIN, `LMS_API_SECRET must be at least ${SECRET_MIN} characters`);
    need('LMS_API_SECRET', !env.LMS_API_SECRET || env.LMS_API_SECRET !== env.LMS_SSO_SECRET, 'LMS_API_SECRET must be different from LMS_SSO_SECRET');
    need('IOT_CREDENTIALS_KEY', !!parseKey(env.IOT_CREDENTIALS_KEY ?? ''), 'IOT_CREDENTIALS_KEY must be 32 bytes: 64 hex characters or base64');
    // Device passwords travel in the API's answers: never over plain HTTP in production
    if (env.NODE_ENV === 'production') {
      need('IOT_STUDIO_API_URL', /^https:\/\//.test(env.IOT_STUDIO_API_URL ?? ''), 'IOT_STUDIO_API_URL must use https in production');
    }
  });

/** Read and check the settings. Throws with every problem listed (never the values). */
export const parseIotStudioConfig = (env: NodeJS.ProcessEnv): IotStudioConfig => {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid IoT Studio settings:\n  ${problems.join('\n  ')}`);
  }
  const e = parsed.data;
  const enabled = e.IOT_INTEGRATION_ENABLED === 'true';
  let mqttCaPem: string | null = null;
  if (enabled && e.IOT_STUDIO_MQTT_CA_FILE?.trim()) {
    mqttCaPem = readFileSync(e.IOT_STUDIO_MQTT_CA_FILE.trim(), 'utf8');
    if (!/-----BEGIN CERTIFICATE-----/.test(mqttCaPem)) {
      throw new Error('Invalid IoT Studio settings:\n  IOT_STUDIO_MQTT_CA_FILE: not a PEM certificate');
    }
  }
  return {
    enabled,
    apiUrl: enabled ? url('IOT_STUDIO_API_URL').parse(e.IOT_STUDIO_API_URL) : '',
    appUrl: enabled ? url('IOT_STUDIO_APP_URL').parse(e.IOT_STUDIO_APP_URL) : '',
    ssoSecret: enabled ? e.LMS_SSO_SECRET ?? '' : '',
    apiSecret: enabled ? e.LMS_API_SECRET ?? '' : '',
    credentialsKey: enabled ? parseKey(e.IOT_CREDENTIALS_KEY ?? '') : null,
    mqttCaPem
  };
};

// Checked when the server starts (server.ts imports this): a bad setting stops it
export const iotStudioConfig: Readonly<IotStudioConfig> = Object.freeze(parseIotStudioConfig(process.env));
