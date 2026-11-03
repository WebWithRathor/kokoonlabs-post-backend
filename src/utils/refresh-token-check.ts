import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';

// The session check compares the refresh-token cookie with the bcrypt hash
// kept in Redis on every request. bcryptjs is pure JS on the main thread
// (tens of ms each), so a match is remembered for a short while.
// The key is sha256(cookie) + the stored hash: logout or token rotation
// changes the stored hash, so an old entry can never match again. Only
// matches are kept; a mismatch is always checked with bcrypt.
// In memory: each server process has its own.

export const VERIFIED_TTL_MS = 5 * 60 * 1000;
export const VERIFIED_MAX_ENTRIES = 20_000;

export const verifiedKey = (incoming: string, storedHash: string): string =>
  `${createHash('sha256').update(incoming, 'utf8').digest('hex')}:${storedHash}`;

export const createRefreshTokenChecker = (
  o: {
    ttlMs?: number;
    maxEntries?: number;
    nowMs?: () => number;
    compare?: (incoming: string, storedHash: string) => Promise<boolean>;
  } = {}
) => {
  const ttlMs = o.ttlMs ?? VERIFIED_TTL_MS;
  const maxEntries = o.maxEntries ?? VERIFIED_MAX_ENTRIES;
  const now = o.nowMs ?? (() => Date.now());
  const compare = o.compare ?? ((a: string, b: string) => bcrypt.compare(a, b));
  // key -> when the match was seen
  const verified = new Map<string, number>();

  return {
    /** Same answer as bcrypt.compare(incoming, storedHash). */
    check: async (incoming: string, storedHash: string): Promise<boolean> => {
      // Anything but two strings goes straight to bcrypt, which answers (or throws) as before
      if (typeof incoming !== 'string' || typeof storedHash !== 'string') return await compare(incoming, storedHash);
      const key = verifiedKey(incoming, storedHash);
      const at = verified.get(key);
      if (at !== undefined) {
        if (now() - at < ttlMs) return true;
        verified.delete(key);
      }
      const ok = await compare(incoming, storedHash);
      if (ok) {
        verified.set(key, now());
        // Oldest first out
        while (verified.size > maxEntries) verified.delete(verified.keys().next().value as string);
      }
      return ok;
    },
    get size() {
      return verified.size;
    }
  };
};

export const refreshTokenChecker = createRefreshTokenChecker();
