import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'crypto';
import { seal, tryUnseal } from '../../utils/iot-crypto';
import {
  CHIP_ID_RE,
  IotStatusEntry,
  MqttLogin,
  UNREGISTERED_STATUS,
  UPSERT_SKIP_MAX_AGE_MS,
  boardStatusOf,
  canSkipUpsert,
  createBatcher,
  createStatusCache,
  mapBulkStatus,
  statusNeedsUpsert,
  upsertComplete,
  upsertForFlash,
  upsertHash
} from '../../utils/iot-studio';

const API = 'http://iot.test/api/v1';
const HW = 'kk-esp32s3-7f3k9q2m';
const body = (o: Record<string, unknown> = {}) => ({
  user: { lmsUserId: 'u1', email: 'asha@example.com', emailVerified: true, name: 'Asha K' },
  device: { name: 'My board', board: 'ESP32-S3 DevKitC', firmwareVersion: 'v1', chipId: 'a1b2c3d4e5f6' },
  program: { programId: 'p1', name: 'Blink', version: 'v1' },
  variables: [{ key: 'temp', displayName: 'Temp', dataType: 'float', direction: 'telemetry', blockId: 'n1' }],
  project: { create: true },
  ...o
});

describe('chip ids', () => {
  it('lowercase hex, 8 to 32 characters', () => {
    for (const ok of ['a1b2c3d4', 'a1b2c3d4e5f6', '0'.repeat(32)]) assert.match(ok, CHIP_ID_RE);
    for (const bad of ['A1B2C3D4', 'a1b2c3d', '0'.repeat(33), 'a1:b2:c3:d4', 'zzzzzzzz', '']) assert.doesNotMatch(bad, CHIP_ID_RE);
  });
});

describe('B1 fingerprint', () => {
  it('ignores key order but sees every change B1 would send', () => {
    const h = upsertHash(API, HW, body());
    const reordered = { project: { create: true }, variables: body().variables, program: body().program, device: body().device, user: body().user };
    assert.equal(upsertHash(API, HW, reordered), h);
    assert.match(h, /^[0-9a-f]{64}$/);
    const changed = [
      upsertHash('http://other/api/v1', HW, body()),
      upsertHash(API, 'kk-esp32s3-aaaaaaaa', body()),
      upsertHash(API, HW, body({ device: { ...body().device, name: 'Renamed' } })),
      upsertHash(API, HW, body({ device: { ...body().device, firmwareVersion: 'v2' } })),
      upsertHash(API, HW, body({ device: { ...body().device, chipId: 'ffffffff' } })),
      upsertHash(API, HW, body({ device: { name: 'My board', board: 'ESP32-S3 DevKitC', firmwareVersion: 'v1' } })),
      upsertHash(API, HW, body({ program: { programId: 'p2', name: 'Blink', version: 'v1' } })),
      upsertHash(API, HW, body({ variables: [] })),
      upsertHash(API, HW, body({ user: { ...body().user, name: 'Asha Kumar' } }))
    ];
    for (const c of changed) assert.notEqual(c, h);
    assert.equal(new Set(changed).size, changed.length);
  });
});

describe('skipping B1', () => {
  const now = 1_800_000_000_000;
  const base = {
    hash: 'h1',
    storedHash: 'h1',
    lastSyncedAt: new Date(now - 60_000),
    registered: true,
    hasConnection: true,
    credentialsOk: true,
    hasProject: true,
    knownChanged: false,
    replaceChip: false,
    nowMs: now
  };

  it('skips only when everything matches and is usable', () => {
    assert.equal(canSkipUpsert(base), true);
    for (const [k, v] of [
      ['storedHash', 'h0'],
      ['storedHash', null],
      ['lastSyncedAt', null],
      ['lastSyncedAt', new Date(now - UPSERT_SKIP_MAX_AGE_MS)],
      ['lastSyncedAt', new Date(now + 60_000)],
      ['registered', false],
      ['hasConnection', false],
      ['credentialsOk', false],
      ['hasProject', false],
      ['knownChanged', true],
      ['replaceChip', true]
    ] as const) {
      assert.equal(canSkipUpsert({ ...base, [k]: v }), false, `${k}=${String(v)}`);
    }
  });

  it('keeps the fingerprint only when B1 made the project and dropped nothing', () => {
    assert.equal(upsertComplete({ projectId: 'p1' }), true);
    assert.equal(upsertComplete({ projectId: 'p1', warnings: [] }), true);
    assert.equal(upsertComplete({ projectId: null, warnings: ['insufficient_tokens_project_not_created'] }), false);
    assert.equal(upsertComplete({ projectId: null, warnings: ['project_limit_reached_project_not_created'] }), false);
    assert.equal(upsertComplete({ projectId: 'p1', warnings: ['variable_limit_reached'] }), false);
    assert.equal(upsertComplete({ projectId: null }), false);
  });

  it('a board IoT Studio removed, switched off or gave to someone else is never skipped', () => {
    const seen = (o: Partial<Extract<IotStatusEntry, { found: true }>> = {}): IotStatusEntry => ({
      found: true,
      ownerLmsUserId: 'u1',
      connectionState: 'connected',
      lastSeenAt: null,
      studioUrl: null,
      ...o
    });
    assert.equal(statusNeedsUpsert(undefined, 'u1'), false);
    assert.equal(statusNeedsUpsert(seen(), 'u1'), false);
    assert.equal(statusNeedsUpsert(seen({ connectionState: 'offline' }), 'u1'), false);
    assert.equal(statusNeedsUpsert({ found: false }, 'u1'), true);
    assert.equal(statusNeedsUpsert(seen({ connectionState: 'disabled' }), 'u1'), true);
    assert.equal(statusNeedsUpsert(seen({ ownerLmsUserId: 'u2' }), 'u1'), true);
  });

  it('a Run after a warning calls B1 again; once complete, the same Run is skipped', () => {
    // What prepareFlashService keeps after each B1, and what the next identical Run decides
    const afterB1 = (r: { projectId: string | null; warnings?: string[] }, projectId: string | null) => ({
      ...base,
      storedHash: upsertComplete(r) ? base.hash : null,
      hasProject: Boolean(projectId)
    });
    assert.equal(canSkipUpsert(afterB1({ projectId: null, warnings: ['insufficient_tokens_project_not_created'] }, null)), false);
    assert.equal(canSkipUpsert(afterB1({ projectId: 'p1', warnings: ['variable_limit_reached'] }, 'p1')), false);
    assert.equal(canSkipUpsert(afterB1({ projectId: 'p1', warnings: [] }, 'p1')), true);
  });
});

describe('B1 for a flash (credentials)', () => {
  const login: MqttLogin = { username: 'kk-esp32s3-7f3k9q2m', password: 'pw-old' };
  const fresh: MqttLogin = { username: 'kk-esp32s3-7f3k9q2m', password: 'pw-new' };
  const run = async (o: { registered: boolean; stored: MqttLogin | null; replaceChip?: boolean; answers: (MqttLogin | null)[] }) => {
    const calls: { rotateCredentials: boolean; replaceChip: boolean }[] = [];
    const answers = [...o.answers];
    const out = await upsertForFlash({
      registered: o.registered,
      stored: o.stored,
      replaceChip: o.replaceChip ?? false,
      call: async opts => {
        calls.push(opts);
        return { credentials: answers.shift() ?? null };
      }
    });
    return { calls, credentials: out.credentials };
  };

  it('a new board: one plain B1, its login is used', async () => {
    const r = await run({ registered: false, stored: null, answers: [fresh] });
    assert.deepEqual(r.calls, [{ rotateCredentials: false, replaceChip: false }]);
    assert.deepEqual(r.credentials, fresh);
  });

  it('a known board with its login kept: one plain B1, the kept login is used', async () => {
    const r = await run({ registered: true, stored: login, answers: [null] });
    assert.deepEqual(r.calls, [{ rotateCredentials: false, replaceChip: false }]);
    assert.deepEqual(r.credentials, login);
  });

  it('a kept login that cannot be read (key changed): straight to rotateCredentials', async () => {
    const key = randomBytes(32);
    const sealed = seal(key, login);
    const stored = tryUnseal<MqttLogin>(randomBytes(32), sealed);
    assert.equal(stored, null);
    const r = await run({ registered: true, stored, answers: [fresh] });
    assert.deepEqual(r.calls, [{ rotateCredentials: true, replaceChip: false }]);
    assert.deepEqual(r.credentials, fresh);
  });

  it('no login given and none kept: asks again with rotateCredentials', async () => {
    const r = await run({ registered: false, stored: null, answers: [null, fresh] });
    assert.deepEqual(r.calls, [
      { rotateCredentials: false, replaceChip: false },
      { rotateCredentials: true, replaceChip: false }
    ]);
    assert.deepEqual(r.credentials, fresh);
  });

  it('replaceChip: never falls back to the old login', async () => {
    const ok = await run({ registered: true, stored: login, replaceChip: true, answers: [fresh] });
    assert.deepEqual(ok.calls, [{ rotateCredentials: false, replaceChip: true }]);
    assert.deepEqual(ok.credentials, fresh);
    const missing = await run({ registered: true, stored: login, replaceChip: true, answers: [null, null] });
    assert.equal(missing.calls.length, 2);
    assert.deepEqual(missing.calls[1], { rotateCredentials: true, replaceChip: false });
    assert.equal(missing.credentials, null);
  });

  it('tryUnseal reads a good value and returns null for nothing or damage', () => {
    const key = randomBytes(32);
    const sealed = seal(key, login);
    assert.deepEqual(tryUnseal(key, sealed), login);
    assert.equal(tryUnseal(key, null), null);
    assert.equal(tryUnseal(null, sealed), null);
    assert.equal(tryUnseal(key, { ...sealed, tag: Buffer.alloc(16).toString('base64') }), null);
    assert.equal(tryUnseal(key, { iv: 'x', tag: 'y', data: 'z' }), null);
  });
});

describe('bulk status mapping', () => {
  it('keeps asked-for ids only; devices win over missing; bad rows are dropped', () => {
    const m = mapBulkStatus(['kk-a-00000000', 'kk-b-00000000', 'kk-c-00000000', 'kk-d-00000000'], {
      devices: [
        { hardwareId: 'kk-a-00000000', deviceId: 'd1', ownerLmsUserId: 'u1', connectionState: 'connected', lastSeenAt: 1700, studioUrl: 'http://app/#/devices/d1' },
        { hardwareId: 'kk-b-00000000', ownerLmsUserId: 'u1', connectionState: 'disconnected', lastSeenAt: null },
        { hardwareId: 'kk-zz-0000000', ownerLmsUserId: 'u1', connectionState: 'connected' },
        { hardwareId: 'kk-d-00000000', ownerLmsUserId: 'u1' }
      ] as never,
      missing: ['kk-c-00000000', 'kk-a-00000000', 42]
    });
    assert.deepEqual([...m.keys()].sort(), ['kk-a-00000000', 'kk-b-00000000', 'kk-c-00000000']);
    assert.deepEqual(m.get('kk-a-00000000'), {
      found: true,
      ownerLmsUserId: 'u1',
      connectionState: 'connected',
      lastSeenAt: 1700,
      studioUrl: 'http://app/#/devices/d1'
    });
    assert.deepEqual(m.get('kk-b-00000000'), { found: true, ownerLmsUserId: 'u1', connectionState: 'disconnected', lastSeenAt: null, studioUrl: null });
    assert.deepEqual(m.get('kk-c-00000000'), { found: false });
    assert.equal(mapBulkStatus(['kk-a-00000000'], null).size, 0);
  });

  it('becomes the same shape the status route always returned', () => {
    const entry: IotStatusEntry = { found: true, ownerLmsUserId: 'u1', connectionState: 'connected', lastSeenAt: 1700, studioUrl: 'http://app/#/devices/d1' };
    assert.deepEqual(boardStatusOf(entry, 'u1', null), {
      registered: true,
      online: true,
      connectionState: 'connected',
      lastSeenAt: 1700,
      studioRoute: '/devices/d1'
    });
    const off = boardStatusOf({ ...entry, connectionState: 'disconnected', studioUrl: null }, 'u1', 'http://app/#/devices/kept');
    assert.deepEqual(off, { registered: true, online: false, connectionState: 'disconnected', lastSeenAt: 1700, studioRoute: '/devices/kept' });
    assert.deepEqual(boardStatusOf({ found: false }, 'u1', null), { ...UNREGISTERED_STATUS });
    assert.deepEqual(boardStatusOf(undefined, 'u1', null), { ...UNREGISTERED_STATUS });
    assert.equal(boardStatusOf(entry, 'u2', null), 'owned_by_other_user');
  });
});

describe('status cache', () => {
  const make = (o: { ttlMs?: number; maxEntries?: number } = {}) => {
    let now = 0;
    const fetches: string[][] = [];
    let fail = false;
    let gate: Promise<void> | null = null;
    const cache = createStatusCache<string>({
      ttlMs: o.ttlMs ?? 10_000,
      maxEntries: o.maxEntries ?? 100,
      nowMs: () => now,
      fetchMany: async keys => {
        fetches.push([...keys]);
        if (gate) await gate;
        if (fail) throw new Error('down');
        // "gone" is never answered (left out of the map)
        return new Map(keys.filter(k => k !== 'gone').map(k => [k, `v:${k}:${now}`]));
      }
    });
    return {
      cache,
      fetches,
      tick: (ms: number) => (now += ms),
      setFail: (f: boolean) => (fail = f),
      hold: () => {
        let open!: () => void;
        gate = new Promise<void>(r => (open = r));
        return () => {
          gate = null;
          open();
        };
      }
    };
  };

  it('answers from the cache within the TTL, asks again after it', async () => {
    const t = make();
    assert.deepEqual([...(await t.cache.getMany(['a', 'b']))], [['a', 'v:a:0'], ['b', 'v:b:0']]);
    t.tick(9_999);
    await t.cache.getMany(['a', 'b']);
    assert.equal(t.fetches.length, 1);
    t.tick(1);
    // Only the expired / unknown ones are fetched, in one call
    const m = await t.cache.getMany(['a', 'b', 'c']);
    assert.deepEqual(t.fetches, [['a', 'b'], ['a', 'b', 'c']]);
    assert.equal(m.get('c'), 'v:c:10000');
  });

  it('concurrent identical requests share one fetch', async () => {
    const t = make();
    const open = t.hold();
    const all = Promise.all([t.cache.getMany(['a', 'b']), t.cache.getMany(['b', 'a']), t.cache.getMany(['a', 'c'])]);
    open();
    const [x, y, z] = await all;
    assert.deepEqual(t.fetches, [['a', 'b'], ['c']]);
    assert.equal(x.get('a'), y.get('a'));
    assert.equal(z.get('a'), x.get('a'));
    assert.equal(z.get('c'), 'v:c:0');
  });

  it('is size-capped (oldest out) and leaves out keys the fetch did not answer', async () => {
    const t = make({ maxEntries: 2 });
    await t.cache.getMany(['a', 'b', 'c', 'gone']);
    assert.equal(t.cache.size, 2);
    assert.equal(t.cache.peek('a'), undefined);
    assert.equal(t.cache.peek('c'), 'v:c:0');
    assert.equal((await t.cache.getMany(['gone'])).has('gone'), false);
  });

  it('does not cache failures; invalidate forces a fresh ask', async () => {
    const t = make();
    t.setFail(true);
    await assert.rejects(t.cache.getMany(['a']), /down/);
    await assert.rejects(t.cache.getMany(['a']), /down/);
    assert.equal(t.fetches.length, 2);
    t.setFail(false);
    await t.cache.getMany(['a']);
    t.cache.invalidate('a');
    t.tick(5);
    assert.equal((await t.cache.getMany(['a'])).get('a'), 'v:a:5');
    assert.equal(t.fetches.length, 4);
  });

  it('a value invalidated while being fetched is not kept', async () => {
    const t = make();
    const open = t.hold();
    const p = t.cache.getMany(['a']);
    t.cache.invalidate('a');
    open();
    assert.equal((await p).get('a'), 'v:a:0');
    assert.equal(t.cache.peek('a'), undefined);
  });
});

describe('flash request validation (chipId, replaceChip)', () => {
  // Runs the express-validator chain on a fake request; resolves to the 400 messages, or [] when it passes
  const validate = async (extra: Record<string, unknown>) => {
    const { validateFlash } = await import('../../validators/public/iot-studio.validator');
    const req = {
      params: { id: '64f0c0ffee64f0c0ffee64f0' },
      body: { programId: '64f0c0ffee64f0c0ffee64f1', version: 'v1', variables: [], ...extra }
    } as never;
    let messages: string[] = [];
    const res = {
      status: () => res,
      json: (b: { errors?: { message: string }[]; error?: unknown; data?: unknown }) => {
        messages = JSON.stringify(b).match(/"message":"[^"]*"/g) ?? ['failed'];
        return res;
      }
    } as never;
    for (const step of validateFlash) {
      await new Promise<void>(resolve => {
        const out = (step as (q: unknown, s: unknown, n: () => void) => unknown)(req, res, () => resolve());
        Promise.resolve(out).then(() => resolve());
      });
    }
    return { messages, body: (req as { body: Record<string, unknown> }).body };
  };

  it('accepts no chip, a null chip, and a valid chip (lowercased)', async () => {
    assert.deepEqual((await validate({})).messages, []);
    assert.deepEqual((await validate({ chipId: null })).messages, []);
    const r = await validate({ chipId: ' A1B2C3D4E5F6 ', replaceChip: true });
    assert.deepEqual(r.messages, []);
    assert.equal(r.body.chipId, 'a1b2c3d4e5f6');
  });

  it('rejects bad chip ids and replaceChip without a chip or not a boolean', async () => {
    for (const extra of [{ chipId: 'xyz' }, { chipId: 12345678 }, { chipId: 'a1:b2:c3:d4' }, { replaceChip: true }, { chipId: 'a1b2c3d4', replaceChip: 'yes' }]) {
      const r = await validate(extra);
      assert.ok(r.messages.length > 0, JSON.stringify(extra));
    }
  });
});

describe('status batcher', () => {
  const make = (o: { maxKeys?: number; fail?: (keys: string[]) => boolean } = {}) => {
    const fetches: string[][] = [];
    const load = createBatcher<string>({
      windowMs: 5,
      maxKeys: o.maxKeys ?? 200,
      fetchMany: async keys => {
        fetches.push([...keys]);
        if (o.fail?.(keys)) throw new Error('down');
        return new Map(keys.filter(k => k !== 'gone').map(k => [k, `v:${k}`]));
      }
    });
    return { load, fetches };
  };

  it('different callers arriving together share one fetch and each get only their keys', async () => {
    const t = make();
    const [a, b, c] = await Promise.all([t.load(['a', 'b']), t.load(['b', 'c']), t.load(['gone', 'd'])]);
    assert.deepEqual(t.fetches, [['a', 'b', 'c', 'gone', 'd']]);
    assert.deepEqual([...a], [['a', 'v:a'], ['b', 'v:b']]);
    assert.deepEqual([...b], [['b', 'v:b'], ['c', 'v:c']]);
    assert.deepEqual([...c], [['d', 'v:d']]);
  });

  it('never puts more than maxKeys in one fetch', async () => {
    const t = make({ maxKeys: 4 });
    await Promise.all([t.load(['a', 'b', 'c']), t.load(['d', 'e']), t.load(['f']), t.load(['g', 'h', 'i', 'j', 'k'])]);
    assert.ok(t.fetches.every(f => f.length <= 4 || f.join() === 'g,h,i,j,k'), JSON.stringify(t.fetches));
    assert.deepEqual(t.fetches.flat().sort(), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']);
  });

  it('a failed fetch fails its callers only; the next batch is asked afresh', async () => {
    let first = true;
    const t = make({ fail: () => (first ? ((first = false), true) : false) });
    const r = await Promise.allSettled([t.load(['a']), t.load(['b'])]);
    assert.deepEqual(r.map(x => x.status), ['rejected', 'rejected']);
    assert.equal((await t.load(['a'])).get('a'), 'v:a');
    assert.equal(t.fetches.length, 2);
  });

  it('200 students polling at once make one IoT Studio call through the cache', async () => {
    const t = make();
    const cache = createStatusCache<string>({ ttlMs: 10_000, maxEntries: 1000, fetchMany: t.load });
    await Promise.all(Array.from({ length: 200 }, (_, i) => cache.getMany([`kk-b-${i}`])));
    assert.equal(t.fetches.length, 1);
    assert.equal(t.fetches[0].length, 200);
  });
});
