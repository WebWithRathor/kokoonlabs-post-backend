import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { seal, unseal } from '../../utils/iot-crypto';
import { parseIotStudioConfig } from '../../config/iot-studio.config';
import {
  HARDWARE_ID_RE,
  IOT_BOARDS,
  checkVariables,
  mintSsoToken,
  newHardwareId,
  routeOfStudioUrl,
  sanitizeNext
} from '../../utils/iot-studio';

const SSO = 'sso-secret-for-tests-0123456789abcdefghijklmnopqrstuvwxyz';
const who = { lmsUserId: '64f0c0ffee', email: 'asha@example.com', emailVerified: true, name: 'Asha K' };

describe('SSO token', () => {
  it('has the contract claims and lives 60 s', () => {
    const now = 1_800_000_000;
    const token = mintSsoToken(SSO, who, now);
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()) as { alg: string };
    assert.equal(header.alg, 'HS256');
    const c = jwt.verify(token, SSO, { algorithms: ['HS256'], audience: 'kokoon-iot-studio', issuer: 'kokoon-lms', clockTimestamp: now }) as Record<string, unknown>;
    assert.equal(c.iss, 'kokoon-lms');
    assert.equal(c.aud, 'kokoon-iot-studio');
    assert.equal(c.sub, who.lmsUserId);
    assert.equal(c.email, who.email);
    assert.equal(c.email_verified, true);
    assert.equal(c.name, who.name);
    assert.equal(c.iat, now);
    assert.equal(c.exp, now + 60);
    assert.match(String(c.jti), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.deepEqual(Object.keys(c).sort(), ['aud', 'email', 'email_verified', 'exp', 'iat', 'iss', 'jti', 'name', 'sub']);
  });

  it('is expired after 60 s and gets a new jti every time', () => {
    const now = 1_800_000_000;
    const token = mintSsoToken(SSO, who, now);
    assert.throws(() => jwt.verify(token, SSO, { clockTimestamp: now + 61 }), { name: 'TokenExpiredError' });
    const jtis = new Set(Array.from({ length: 20 }, () => (jwt.decode(mintSsoToken(SSO, who, now)) as { jti: string }).jti));
    assert.equal(jtis.size, 20);
  });

  it('next: starts with "/" and has no "//"', () => {
    assert.equal(sanitizeNext('/devices/abc'), '/devices/abc');
    assert.equal(sanitizeNext('/projects/p1/editor'), '/projects/p1/editor');
    assert.equal(sanitizeNext('/'), '/');
    for (const bad of ['devices', '//evil.com', '/a//b', 'https://evil.com/x', '/x\\y', '/a b', 42, undefined, '/'.padEnd(300, 'a')]) {
      assert.equal(sanitizeNext(bad), '/', String(bad));
    }
    assert.equal(routeOfStudioUrl('http://localhost:5173/#/devices/d_9'), '/devices/d_9');
    assert.equal(routeOfStudioUrl('http://localhost:5173/'), '/');
  });
});

describe('hardware ids', () => {
  it('kk-<boardslug>-<8 base32>, valid for IoT Studio, never reserved', () => {
    const slugs = ['esp32s3', 'esp32c3', 'brainboard', 'esp32wroom'];
    IOT_BOARDS.forEach((board, i) => {
      for (let n = 0; n < 50; n++) {
        const id = newHardwareId(board);
        assert.match(id, new RegExp(`^kk-${slugs[i]}-[0-9a-hjkmnp-tv-z]{8}$`));
        assert.match(id, HARDWARE_ID_RE);
        assert.ok(!id.startsWith('sandbox-') && !id.startsWith('esp32-sim-'));
      }
    });
  });
});

describe('declared variables', () => {
  const v = (o: Record<string, unknown>) => ({ key: 'temperature', displayName: 'Temperature', dataType: 'float', direction: 'telemetry', blockId: 'n1', ...o });

  it('keeps unit/min/max only for numbers', () => {
    const r = checkVariables([v({ unit: '°C', min: 0, max: 50 }), v({ key: 'led', dataType: 'boolean', direction: 'bidirectional', unit: 'x', min: 1, blockId: 'n2' })]);
    assert.ok('variables' in r);
    assert.deepEqual(r.variables[0], { key: 'temperature', displayName: 'Temperature', dataType: 'float', direction: 'telemetry', unit: '°C', min: 0, max: 50, blockId: 'n1' });
    assert.deepEqual(r.variables[1], { key: 'led', displayName: 'Temperature', dataType: 'boolean', direction: 'bidirectional', blockId: 'n2' });
  });

  it('rejects bad keys, duplicates, unknown types, min > max and more than 30', () => {
    for (const [input, problem] of [
      [[v({ key: 'Temp' })], /not a valid/],
      [[v({ key: '1x' })], /not a valid/],
      [[v({ key: 'a'.repeat(41) })], /not a valid/],
      [[v({}), v({ blockId: 'n2' })], /declared twice/],
      [[v({ dataType: 'number' })], /unknown type/],
      [[v({ direction: 'both' })], /unknown direction/],
      [[v({ min: 5, max: 1 })], /min must not be more than max/],
      [[v({ blockId: '' })], /no block id/],
      [Array.from({ length: 31 }, (_, i) => v({ key: `k${i}`, blockId: `n${i}` })), /at most 30/]
    ] as const) {
      const r = checkVariables(input);
      assert.ok('problem' in r);
      assert.match(r.problem, problem);
    }
  });
});

describe('stored credentials', () => {
  const key = Buffer.alloc(32, 7);
  it('round-trip, different every time, tamper-proof', () => {
    const a = seal(key, { username: 'kk-esp32s3-x', password: 'p@ss' });
    const b = seal(key, { username: 'kk-esp32s3-x', password: 'p@ss' });
    assert.notEqual(a.data, b.data);
    assert.deepEqual(unseal(key, a), { username: 'kk-esp32s3-x', password: 'p@ss' });
    assert.doesNotMatch(JSON.stringify(a), /p@ss/);
    const tampered = { ...a, data: Buffer.from('x' + Buffer.from(a.data, 'base64').toString('binary').slice(1), 'binary').toString('base64') };
    assert.throws(() => unseal(key, tampered));
    assert.throws(() => unseal(Buffer.alloc(32, 8), a));
  });
});

describe('settings', () => {
  const good = {
    IOT_INTEGRATION_ENABLED: 'true',
    IOT_STUDIO_API_URL: 'http://localhost:4000/api/v1/',
    IOT_STUDIO_APP_URL: 'http://localhost:5173',
    LMS_SSO_SECRET: 's'.repeat(48),
    LMS_API_SECRET: 'a'.repeat(48),
    IOT_CREDENTIALS_KEY: 'ab'.repeat(32)
  };
  it('accepts good settings (trailing slash dropped)', () => {
    const c = parseIotStudioConfig(good);
    assert.equal(c.enabled, true);
    assert.equal(c.apiUrl, 'http://localhost:4000/api/v1');
    assert.equal(c.credentialsKey?.length, 32);
  });
  it('off: nothing required', () => {
    assert.equal(parseIotStudioConfig({}).enabled, false);
  });
  it('lists every problem without the secret values', () => {
    assert.throws(
      () => parseIotStudioConfig({ ...good, LMS_SSO_SECRET: 'short', LMS_API_SECRET: 'short', IOT_CREDENTIALS_KEY: 'nope', IOT_STUDIO_APP_URL: 'ftp://x' }),
      (err: Error) => {
        assert.match(err.message, /LMS_SSO_SECRET/);
        assert.match(err.message, /LMS_API_SECRET/);
        assert.match(err.message, /IOT_CREDENTIALS_KEY/);
        assert.match(err.message, /IOT_STUDIO_APP_URL/);
        assert.doesNotMatch(err.message, /short|nope/);
        return true;
      }
    );
    assert.throws(() => parseIotStudioConfig({ ...good, LMS_API_SECRET: good.LMS_SSO_SECRET }), /different/);
    assert.throws(() => parseIotStudioConfig({ ...good, NODE_ENV: 'production' }), /https in production/);
  });
});
