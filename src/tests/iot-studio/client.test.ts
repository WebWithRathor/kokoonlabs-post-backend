import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import {
  IotStudioError,
  createIotStudioClient,
  isRetryable,
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
