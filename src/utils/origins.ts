import { config } from '../config/config';

// CORS_ORIGIN is a comma-separated list. Brackets, quotes and backticks are
// tolerated (the .env.example uses "[a , b]"). Matching is EXACT: before,
// indexOf on the raw string let any substring of the list pass as an origin.
const parseOrigins = (raw: string): string[] =>
  raw
    .replace(/[[\]`'"]/g, '')
    .split(',')
    .map(o => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

export const allowedOrigins: ReadonlySet<string> = new Set(
  parseOrigins(config.corsOrigin)
);

export const isAllowedOrigin = (origin: string): boolean =>
  allowedOrigins.has(origin.replace(/\/+$/, ''));
