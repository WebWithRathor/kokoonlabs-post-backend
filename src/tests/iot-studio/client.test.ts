import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import {
  IotStudioError,
  createIotStudioClient,
  createLimiter,
  isParallelCreate,
  isRetryable,
  lmsErrorFor,
  selfCheckVerdict,
  signRequest,
  studentMessageFor,
  warningMessage
} from '../../utils/iot-studio-client';

const SECRET = 'test-secret-do-not-use-0123456789abcdefghijklmnopqrstuvwxyz';
const BASE = 'http://iot.test/api/v1';

describe('signRequest (contract test vectors)', () => {
  it('PUT with rotateCredentials', () => {
    assert.equal(
      signRequest(
        SECRET,
        '1800000000',
        'PUT',
        '/api/v1/integrations/lms/devices/kk-esp32s3-7f3k9q2m?rotateCredentials=true',
        '{"user":{"lmsUserId":"u_123"}}'
      ),
      'sha256=37d6a34b921b9ba33d7bf27e5c6a1d844b4955d4ab730968825bd24622db50a0'
    );
  });
  it('GET with an empty body', () => {
    assert.equal(
      signRequest(SECRET, '1800000000', 'GET', '/api/v1/integrations/lms/devices/kk-esp32s3-7f3k9q2m', ''),
      'sha256=415c03b21622ec7e03a63e49abc8285a9434dfbf23cbc0294d35b0989b1cbf77'
    );
  });
});

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

/** A fake IoT Studio: answers in order, records what was sent. */
const fakeFetch = (answers: (Response | Error)[]) => {
  const calls: Call[] = [];
  const impl = (async (input: URL | string, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: String(init?.method),
      headers: init?.headers as Record<string, string>,
      body: (init?.body as string) ?? ''
    });
    const next = answers.shift();
    if (!next) throw new Error('no more answers');
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { impl, calls };
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const errorBody = (code: string, extra: Record<string, unknown> = {}) => ({ error: { code, message: code, ...extra }, requestId: 'req_io_1' });

const make = (answers: (Response | Error)[], sleeps: number[] = []) => {
  const fake = fakeFetch(answers);
  const client = createIotStudioClient({
    baseUrl: BASE,
    secret: SECRET,
    fetchImpl: fake.impl,
    sleep: async ms => {
      sleeps.push(ms);
    },
    nowMs: () => 1_800_000_000_000
  });
  return { client, calls: fake.calls, sleeps };
};

describe('IoT Studio client', () => {
  it('signs exactly the bytes and path it sends (API base path and query included)', async () => {
    const { client, calls } = make([json(200, { deviceId: 'd1' })]);
    const body = { user: { lmsUserId: 'u_123' }, note: 'ü °C' };
    const res = await client.upsertDevice('kk-esp32s3-7f3k9q2m', body, { rotateCredentials: true });
    assert.equal(res.status, 200);
    const [call] = calls;
    assert.equal(call.method, 'PUT');
    assert.equal(call.url, `${BASE}/integrations/lms/devices/kk-esp32s3-7f3k9q2m?rotateCredentials=true`);
    assert.equal(call.headers['Content-Type'], 'application/json');
    assert.equal(call.headers['X-Kokoon-Timestamp'], '1800000000');
    assert.match(call.headers['X-Kokoon-Request-Id'], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const expected = createHmac('sha256', SECRET)
      .update(`1800000000.PUT./api/v1/integrations/lms/devices/kk-esp32s3-7f3k9q2m?rotateCredentials=true.${call.body}`)
      .digest('hex');
    assert.equal(call.headers['X-Kokoon-Signature'], `sha256=${expected}`);
    assert.equal(call.body, JSON.stringify(body));
  });

  it('GET and DELETE sign an empty body and send none', async () => {
    const { client, calls } = make([json(200, { connectionState: 'connected' }), new Response(null, { status: 204 })]);
    await client.getDevice('kk-esp32c3-abcdefgh');
    const del = await client.deleteDevice('kk-esp32c3-abcdefgh');
    assert.equal(del.status, 204);
    assert.equal(del.data, null);
    for (const c of calls) {
      assert.equal(c.body, '');
      assert.equal(c.headers['Content-Type'], undefined);
      assert.equal(
        c.headers['X-Kokoon-Signature'],
        signRequest(SECRET, '1800000000', c.method, '/api/v1/integrations/lms/devices/kk-esp32c3-abcdefgh', '')
      );
    }
  });

  it('retries 503 unavailable, 429 and 500 with the SAME Request-Id, honouring Retry-After', async () => {
    const { client, calls, sleeps } = make(
      [
        json(503, errorBody('unavailable')),
        json(429, errorBody('rate_limited'), { 'Retry-After': '2' }),
        json(500, errorBody('internal_error')),
        json(201, { deviceId: 'd1' })
      ],
      []
    );
    const res = await client.upsertDevice('kk-esp32s3-7f3k9q2m', { a: 1 }, { requestId: '11111111-1111-4111-8111-111111111111' });
    assert.equal(res.status, 201);
    assert.equal(calls.length, 4);
    assert.ok(calls.every(c => c.headers['X-Kokoon-Request-Id'] === '11111111-1111-4111-8111-111111111111'));
    assert.equal(sleeps[1], 2000);
  });

  it('retries network errors and timeouts, then gives up after 3 retries', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const { client, calls } = make([new TypeError('fetch failed'), timeout, new TypeError('fetch failed'), timeout]);
    await assert.rejects(client.getDevice('kk-esp32s3-7f3k9q2m'), (err: IotStudioError) => {
      assert.equal(err.code, 'timeout');
      assert.equal(err.status, 0);
      assert.match(err.studentMessage, /Couldn't reach IoT Studio/);
      return true;
    });
    assert.equal(calls.length, 4);
  });

  it('honours 503 request_in_progress', async () => {
    const { client, calls } = make([json(503, errorBody('request_in_progress'), { 'Retry-After': '1' }), json(200, {})]);
    await client.upsertDevice('kk-esp32s3-7f3k9q2m', {});
    assert.equal(calls.length, 2);
  });

  it('does not wait for a Retry-After longer than its limit', async () => {
    const { client, calls } = make([json(429, errorBody('rate_limited'), { 'Retry-After': '120' })]);
    await assert.rejects(client.getDevice('kk-esp32s3-7f3k9q2m'), { code: 'rate_limited' });
    assert.equal(calls.length, 1);
  });

  for (const [status, code] of [
    [401, 'invalid_signature'],
    [401, 'stale_timestamp'],
    [403, 'user_disabled'],
    [404, 'not_found'],
    [409, 'device_owned_by_other_user'],
    [413, 'validation_failed'],
    [422, 'validation_failed'],
    [503, 'integration_disabled']
  ] as const) {
    it(`does not retry ${status} ${code}`, async () => {
      const { client, calls } = make([json(status, errorBody(code))]);
      await assert.rejects(client.upsertDevice('kk-esp32s3-7f3k9q2m', {}), (err: IotStudioError) => {
        assert.equal(err.status, status);
        assert.equal(err.code, code);
        assert.equal(err.requestId, 'req_io_1');
        return true;
      });
      assert.equal(calls.length, 1);
    });
  }

  it('can be told not to retry (status polling)', async () => {
    const { client, calls } = make([json(503, errorBody('unavailable'))]);
    await assert.rejects(client.getDevice('kk-esp32s3-7f3k9q2m', { maxRetries: 0 }), { code: 'unavailable' });
    assert.equal(calls.length, 1);
  });

  it('reads 422 field errors and the replay header', async () => {
    const { client } = make([
      json(422, errorBody('validation_failed', { details: { fieldErrors: { 'user.email': ['taken'] } } })),
      json(200, { deviceId: 'd' }, { 'X-Kokoon-Idempotent-Replay': 'true' })
    ]);
    await assert.rejects(client.upsertDevice('kk-esp32s3-7f3k9q2m', {}), (err: IotStudioError) => {
      assert.deepEqual(err.fieldErrors, { 'user.email': 'taken' });
      assert.match(err.studentMessage, /already used by another IoT Studio account/);
      return true;
    });
    assert.equal((await client.upsertDevice('kk-esp32s3-7f3k9q2m', {})).replay, true);
  });

  it('a proxy error page without JSON counts as unavailable (retried)', async () => {
    const { client, calls } = make([new Response('<html>Bad gateway</html>', { status: 502 }), json(200, {})]);
    await client.getDevice('kk-esp32s3-7f3k9q2m');
    assert.equal(calls.length, 2);
  });

  it('never reports bodies or signatures on failure', async () => {
    const seen: unknown[] = [];
    const fake = fakeFetch([json(401, errorBody('invalid_signature'))]);
    const client = createIotStudioClient({ baseUrl: BASE, secret: SECRET, fetchImpl: fake.impl, onFailure: i => seen.push(i) });
    await assert.rejects(client.upsertDevice('kk-esp32s3-7f3k9q2m', { credentials: { password: 'pw-123' } }));
    const text = JSON.stringify(seen);
    assert.doesNotMatch(text, /pw-123|sha256=|test-secret/);
    assert.match(text, /invalid_signature/);
  });
});

describe('error mapping', () => {
  it('retryable codes', () => {
    assert.equal(isRetryable(0, 'network_error'), true);
    assert.equal(isRetryable(429, 'rate_limited'), true);
    assert.equal(isRetryable(500, 'internal_error'), true);
    assert.equal(isRetryable(503, 'unavailable'), true);
    assert.equal(isRetryable(503, 'request_in_progress'), true);
    assert.equal(isRetryable(503, 'integration_disabled'), false);
    for (const s of [401, 403, 404, 409, 413, 422]) assert.equal(isRetryable(s, 'x'), false);
  });

  it('every contract code has its own student message', () => {
    const codes: [number, string][] = [
      [401, 'invalid_signature'],
      [401, 'stale_timestamp'],
      [422, 'validation_failed'],
      [409, 'device_owned_by_other_user'],
      [403, 'user_disabled'],
      [404, 'not_found'],
      [503, 'integration_disabled'],
      [429, 'rate_limited'],
      [503, 'request_in_progress'],
      [503, 'unavailable'],
      [500, 'internal_error'],
      [0, 'network_error']
    ];
    const messages = codes.map(([s, c]) => studentMessageFor(s, c));
    assert.equal(new Set(messages).size, messages.length - 0);
    assert.match(studentMessageFor(503, 'integration_disabled'), /not available/);
    assert.match(studentMessageFor(500, 'internal_error', undefined, 'req_9'), /req_9/);
    assert.match(studentMessageFor(413, 'validation_failed'), /too much/);
    assert.match(studentMessageFor(422, 'validation_failed', { 'variables.0.key': 'bad' }), /variables\.0\.key bad/);
  });

  it('warnings', () => {
    assert.equal(
      warningMessage('insufficient_tokens_project_not_created'),
      'Your board is connected, but your IoT Studio plan has no tokens left for a new project.'
    );
    assert.match(warningMessage('project_limit_reached_project_not_created'), /project limit/);
    assert.match(warningMessage('variable_limit_reached'), /as many variables/);
    assert.match(warningMessage('something_new'), /something new/);
  });
});

describe('IoT Studio client: chips, bulk status, deadlines', () => {
  it('replaceChip (and rotateCredentials) go in the signed query', async () => {
    const { client, calls } = make([json(200, {}), json(200, {})]);
    await client.upsertDevice('kk-esp32s3-7f3k9q2m', { a: 1 }, { replaceChip: true });
    await client.upsertDevice('kk-esp32s3-7f3k9q2m', { a: 1 }, { rotateCredentials: true, replaceChip: true });
    assert.equal(calls[0].url, `${BASE}/integrations/lms/devices/kk-esp32s3-7f3k9q2m?replaceChip=true`);
    assert.equal(calls[1].url, `${BASE}/integrations/lms/devices/kk-esp32s3-7f3k9q2m?rotateCredentials=true&replaceChip=true`);
    assert.equal(
      calls[1].headers['X-Kokoon-Signature'],
      signRequest(SECRET, '1800000000', 'PUT', '/api/v1/integrations/lms/devices/kk-esp32s3-7f3k9q2m?rotateCredentials=true&replaceChip=true', calls[1].body)
    );
  });

  it('bulk status is a signed POST with the ids as JSON and a Request-Id', async () => {
    const { client, calls } = make([json(200, { devices: [], missing: ['kk-a-00000000'] })]);
    const res = await client.getDevicesStatus<{ missing: string[] }>(['kk-a-00000000', 'kk-b-00000000']);
    assert.deepEqual(res.data.missing, ['kk-a-00000000']);
    const [c] = calls;
    assert.equal(c.method, 'POST');
    assert.equal(c.url, `${BASE}/integrations/lms/devices/status`);
    assert.equal(c.body, JSON.stringify({ hardwareIds: ['kk-a-00000000', 'kk-b-00000000'] }));
    assert.equal(c.headers['Content-Type'], 'application/json');
    assert.match(c.headers['X-Kokoon-Request-Id'], /^[0-9a-f-]{36}$/);
    assert.equal(c.headers['X-Kokoon-Signature'], signRequest(SECRET, '1800000000', 'POST', '/api/v1/integrations/lms/devices/status', c.body));
  });

  it('retries the "registered by a parallel request" 409, not a real other-student 409', async () => {
    const parallel = errorBody('device_owned_by_other_user', { message: 'This hardware id was registered by a parallel request; retry.' });
    const { client, calls } = make([json(409, parallel), json(200, { deviceId: 'd1' })]);
    assert.equal((await client.upsertDevice('kk-esp32s3-7f3k9q2m', {})).status, 200);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].headers['X-Kokoon-Request-Id'], calls[1].headers['X-Kokoon-Request-Id']);

    const other = errorBody('device_owned_by_other_user', { message: 'This hardware id is registered to another IoT Studio account.' });
    const two = make([json(409, other)]);
    await assert.rejects(two.client.upsertDevice('kk-esp32s3-7f3k9q2m', {}), { code: 'device_owned_by_other_user' });
    assert.equal(two.calls.length, 1);
  });

  it('chip errors are not retried and keep the other board id and message', async () => {
    const { client, calls } = make([
      json(409, errorBody('chip_in_use', { message: 'Chip bound elsewhere', details: { hardwareId: 'kk-esp32s3-aaaaaaaa' } }))
    ]);
    await assert.rejects(client.upsertDevice('kk-esp32s3-7f3k9q2m', {}), (err: IotStudioError) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'chip_in_use');
      assert.equal(err.otherHardwareId, 'kk-esp32s3-aaaaaaaa');
      assert.equal(err.detail, 'Chip bound elsewhere');
      assert.match(err.studentMessage, /already registered as another board/);
      return true;
    });
    assert.equal(calls.length, 1);
  });

  it('a deadline caps the per-try timeout and stops retries that would not fit', async () => {
    let now = 1_800_000_000_000;
    const sleeps: number[] = [];
    const fake = fakeFetch([json(503, errorBody('unavailable'), { 'Retry-After': '2' }), json(503, errorBody('unavailable'), { 'Retry-After': '2' })]);
    const client = createIotStudioClient({
      baseUrl: BASE,
      secret: SECRET,
      fetchImpl: fake.impl,
      nowMs: () => now,
      sleep: async ms => {
        sleeps.push(ms);
        now += ms;
      }
    });
    // 3.5 s: one 2 s wait fits (1.5 s left), a second one would not
    await assert.rejects(client.request('PUT', '/devices/kk-esp32s3-7f3k9q2m', { body: {}, deadlineAt: now + 3500 }), { code: 'unavailable' });
    assert.equal(fake.calls.length, 2);
    assert.deepEqual(sleeps, [2000]);
    // Already past the deadline: no call at all
    await assert.rejects(client.request('GET', '/devices/x', { deadlineAt: now - 1 }), { code: 'timeout' });
    assert.equal(fake.calls.length, 2);
  });

  it('a limiter slot is held only while a try is on the wire', async () => {
    const limiter = createLimiter(1, 5);
    const seen: number[] = [];
    const fetchImpl = (async () => {
      seen.push(limiter.active);
      return json(200, {});
    }) as unknown as typeof fetch;
    const client = createIotStudioClient({ baseUrl: BASE, secret: SECRET, fetchImpl, limiter });
    await Promise.all([client.getDevice('kk-a-00000000'), client.getDevice('kk-b-00000000'), client.getDevice('kk-c-00000000')]);
    assert.deepEqual(seen, [1, 1, 1]);
    assert.equal(limiter.active, 0);
    assert.equal(limiter.waiting, 0);
  });

  it('a status poll with a deadline leaves a full limiter\'s queue with "busy" instead of waiting on', async () => {
    const limiter = createLimiter(1, 5);
    const hold = await limiter.acquire();
    const fake = fakeFetch([json(200, { devices: [], missing: [] })]);
    const client = createIotStudioClient({ baseUrl: BASE, secret: SECRET, fetchImpl: fake.impl, limiter });
    // 1.05 s deadline: at most 50 ms in the queue (a try needs 1 s left)
    const started = Date.now();
    await assert.rejects(client.getDevicesStatus(['kk-a-00000000'], { maxRetries: 0, deadlineAt: Date.now() + 1050 }), { code: 'busy' });
    await assert.rejects(client.getDevice('kk-a-00000000', { maxRetries: 0, deadlineAt: Date.now() + 1050 }), { code: 'busy' });
    assert.ok(Date.now() - started < 1000);
    assert.equal(limiter.waiting, 0);
    assert.equal(fake.calls.length, 0);
    hold();
    // A free slot: the same poll goes through
    await client.getDevicesStatus(['kk-a-00000000'], { maxRetries: 0, deadlineAt: Date.now() + 5000 });
    assert.equal(fake.calls.length, 1);
    assert.equal(limiter.active, 0);
  });
});

describe('concurrency limiter', () => {
  it('runs at most max at once, queues up to maxQueue, fails fast beyond', async () => {
    const limiter = createLimiter(2, 1);
    const a = await limiter.acquire();
    const b = await limiter.acquire();
    assert.equal(limiter.active, 2);
    let cGot = false;
    const c = limiter.acquire().then(r => {
      cGot = true;
      return r;
    });
    assert.equal(limiter.waiting, 1);
    await assert.rejects(limiter.acquire(), (err: IotStudioError) => err.code === 'busy' && err.status === 503);
    a();
    a(); // releasing twice frees one slot only
    const release = await c;
    assert.equal(cGot, true);
    assert.equal(limiter.active, 2);
    b();
    release();
    assert.equal(limiter.active, 0);
  });

  it('a waiter gives up with "busy" after its wait limit', async () => {
    const limiter = createLimiter(1, 10);
    const hold = await limiter.acquire();
    await assert.rejects(limiter.acquire(20), { code: 'busy' });
    await assert.rejects(limiter.acquire(0), { code: 'busy' });
    assert.equal(limiter.waiting, 0);
    hold();
    (await limiter.acquire(20))();
    assert.equal(limiter.active, 0);
  });
});

describe('chip and busy errors for the editor', () => {
  it('map to distinct LMS codes the editor can tell apart', () => {
    const mismatch = lmsErrorFor(new IotStudioError(409, 'chip_mismatch', studentMessageFor(409, 'chip_mismatch')));
    const inUse = lmsErrorFor(new IotStudioError(409, 'chip_in_use', studentMessageFor(409, 'chip_in_use')));
    assert.deepEqual([mismatch.statusCode, mismatch.errorCode], [409, 'IOT_CHIP_MISMATCH']);
    assert.deepEqual([inUse.statusCode, inUse.errorCode], [409, 'IOT_CHIP_IN_USE']);
    assert.match(mismatch.message, /Replace/);
    assert.notEqual(mismatch.message, inUse.message);
    assert.equal(lmsErrorFor(new IotStudioError(503, 'busy', 'x')).statusCode, 503);
    assert.equal(lmsErrorFor(new IotStudioError(409, 'device_owned_by_other_user', 'x')).errorCode, 'IOT_DEVICE_OWNED_BY_OTHER_USER');
    assert.equal(lmsErrorFor(new IotStudioError(0, 'timeout', 'x')).statusCode, 502);
    assert.equal(lmsErrorFor(new IotStudioError(409, 'chip_in_use', 'x'), 'own words').message, 'own words');
  });

  it('parallel-create detection needs the 409, the code and the message', () => {
    assert.equal(isParallelCreate(409, 'device_owned_by_other_user', 'registered by a parallel request; retry.'), true);
    assert.equal(isParallelCreate(409, 'device_owned_by_other_user', 'registered to another account'), false);
    assert.equal(isParallelCreate(422, 'device_owned_by_other_user', 'parallel request'), false);
    assert.equal(isRetryable(409, 'device_owned_by_other_user', 'a parallel request'), true);
  });
});

describe('startup self-check verdict', () => {
  const W = 'http://iot.test:4004/api/v1';
  const e = (status: number, code: string, detail?: string) => new IotStudioError(status, code, 'x', undefined, undefined, detail);

  it('404 not_found for the health-check board means OK', () => {
    assert.deepEqual(selfCheckVerdict(e(404, 'not_found', 'No LMS device with this hardware id.'), W), { ok: true, message: `IoT Studio integration OK (${W})` });
    assert.equal(selfCheckVerdict(null, W).ok, true);
  });

  it('names the precise problem', () => {
    const msg = (err: unknown) => {
      const v = selfCheckVerdict(err, W);
      assert.equal(v.ok, false);
      return v.message;
    };
    assert.match(msg(e(404, 'ROUTE_NOT_FOUND')), /must include IoT Studio's API base path/);
    assert.match(msg(e(404, 'unknown_error')), /API base path/);
    assert.match(msg(e(404, 'not_found', 'No LMS integration endpoint GET /x.')), /no LMS device endpoint/);
    assert.match(msg(e(401, 'invalid_signature')), /LMS_API_SECRET must be exactly the same/);
    assert.match(msg(e(401, 'stale_timestamp')), /clock/);
    assert.match(msg(e(503, 'integration_disabled')), /switched off/);
    assert.match(msg(e(0, 'network_error')), /could not reach .*host and port/);
    assert.match(msg(e(0, 'timeout')), /could not reach/);
    assert.match(msg(e(500, 'internal_error')), /answered 500/);
    assert.match(msg(new Error('boom')), /check failed/);
  });

  it('never puts the secret in the message', () => {
    for (const err of [e(401, 'invalid_signature'), e(0, 'network_error'), e(404, 'x')]) {
      assert.doesNotMatch(selfCheckVerdict(err, W).message, /test-secret/);
    }
  });
});
