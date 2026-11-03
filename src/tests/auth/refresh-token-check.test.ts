import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import { VERIFIED_TTL_MS, createRefreshTokenChecker, verifiedKey } from '../../utils/refresh-token-check';

// A stand-in for bcrypt that counts calls: "hash:<token>" matches <token>
const fakeCompare = () => {
  const calls: [string, string][] = [];
  const compare = async (incoming: string, stored: string) => {
    calls.push([incoming, stored]);
    return stored === `hash:${incoming}`;
  };
  return { calls, compare };
};

describe('refresh-token check cache', () => {
  it('keys on sha256(cookie) and the stored hash, never the raw cookie', () => {
    const key = verifiedKey('tok-123', '$2b$10$abc');
    assert.equal(key, `${createHash('sha256').update('tok-123').digest('hex')}:$2b$10$abc`);
    assert.doesNotMatch(key, /tok-123/);
    assert.notEqual(verifiedKey('tok-123', '$2b$10$abd'), key);
  });

  it('a match is remembered; a mismatch is always checked again', async () => {
    const f = fakeCompare();
    const c = createRefreshTokenChecker({ compare: f.compare, nowMs: () => 0 });
    assert.equal(await c.check('t1', 'hash:t1'), true);
    assert.equal(await c.check('t1', 'hash:t1'), true);
    assert.equal(f.calls.length, 1);
    assert.equal(await c.check('bad', 'hash:t1'), false);
    assert.equal(await c.check('bad', 'hash:t1'), false);
    assert.equal(f.calls.length, 3);
    assert.equal(c.size, 1);
  });

  it('logout / rotation (a new stored hash) never hits an old entry', async () => {
    const f = fakeCompare();
    const c = createRefreshTokenChecker({ compare: f.compare, nowMs: () => 0 });
    assert.equal(await c.check('t1', 'hash:t1'), true);
    // Same cookie, the session now holds another token's hash
    assert.equal(await c.check('t1', 'hash:t2'), false);
    assert.equal(f.calls.length, 2);
  });

  it('entries expire after the TTL and the map stays size-capped', async () => {
    let now = 0;
    const f = fakeCompare();
    const c = createRefreshTokenChecker({ compare: f.compare, nowMs: () => now, maxEntries: 2 });
    await c.check('t1', 'hash:t1');
    now += VERIFIED_TTL_MS - 1;
    await c.check('t1', 'hash:t1');
    assert.equal(f.calls.length, 1);
    now += 1;
    await c.check('t1', 'hash:t1');
    assert.equal(f.calls.length, 2);
    await c.check('t2', 'hash:t2');
    await c.check('t3', 'hash:t3');
    assert.equal(c.size, 2);
    // t1 was the oldest: checked with bcrypt again
    await c.check('t1', 'hash:t1');
    assert.equal(f.calls.length, 5);
  });

  it('gives exactly bcrypt.compare\'s answers, errors included', async () => {
    const c = createRefreshTokenChecker();
    const hash = await bcrypt.hash('real-token', 4);
    assert.equal(await c.check('real-token', hash), true);
    assert.equal(await c.check('real-token', hash), true);
    assert.equal(await c.check('other-token', hash), false);
    // A session without a stored hash fails the same way as before
    const before = await bcrypt.compare('real-token', undefined as unknown as string).then(
      () => 'resolved',
      (e: Error) => e.message
    );
    const after = await c.check('real-token', undefined as unknown as string).then(
      () => 'resolved',
      (e: Error) => e.message
    );
    assert.equal(after, before);
  });
});
