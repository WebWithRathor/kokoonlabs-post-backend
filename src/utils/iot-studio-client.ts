import { createHmac, randomUUID } from 'crypto';

// Server-to-server calls to Kokoon IoT Studio (contract B). Every request is
// signed with LMS_API_SECRET over the exact bytes sent:
//   HMAC-SHA256(secret, timestamp + "." + METHOD + "." + pathWithQuery + "." + rawBody)
// pathWithQuery is the path on the HTTP request line, API base path included
// (/api/v1/integrations/lms/devices/<hardwareId>?rotateCredentials=true).
//
// Network errors, 429 and 5xx (except 503 integration_disabled) are retried
// up to 3 times with the SAME Request-Id, waiting for Retry-After when given.
// So is the 409 IoT Studio sends when a parallel request registered the board
// first. A call may carry a deadline: tries, waits and timeouts all fit in it.
// An optional limiter caps how many calls are open at once (fail-fast when
// too many are waiting).
// Nothing secret is ever logged: no bodies, no signatures, no credentials.

export const signRequest = (secret: string, timestamp: string, method: string, pathWithQuery: string, rawBody: string): string =>
  `sha256=${createHmac('sha256', secret).update(`${timestamp}.${method}.${pathWithQuery}.${rawBody}`, 'utf8').digest('hex')}`;

// ── Errors ───────────────────────────────────────────────────────────────────

export class IotStudioError extends Error {
  constructor(
    // IoT Studio's HTTP status (0: no answer)
    public readonly status: number,
    // IoT Studio's error code, or network_error / timeout / bad_response
    public readonly code: string,
    public readonly studentMessage: string,
    // IoT Studio's log id for this request (to report a problem)
    public readonly requestId?: string,
    public readonly fieldErrors?: Record<string, string>,
    // IoT Studio's own message (for logs and checks, not for students)
    public readonly detail?: string,
    // chip_in_use: the other board's hardwareId, only when it is the same student's
    public readonly otherHardwareId?: string
  ) {
    super(`IoT Studio ${status || 'unreachable'} ${code}`);
    this.name = 'IotStudioError';
  }
}

/** IoT Studio's 409 when a parallel request created the same board first: not another student's board. */
export const isParallelCreate = (status: number, code: string, detail?: string): boolean =>
  status === 409 && code === 'device_owned_by_other_user' && /parallel request/i.test(detail ?? '');

/** Worth trying again with the same Request-Id. */
export const isRetryable = (status: number, code: string, detail?: string): boolean =>
  status === 0 || status === 429 || (status >= 500 && code !== 'integration_disabled') || isParallelCreate(status, code, detail);

/** What the student sees for an IoT Studio error (plain words, what to do next). */
export const studentMessageFor = (status: number, code: string, fieldErrors?: Record<string, string>, requestId?: string): string => {
  switch (code) {
    case 'invalid_signature':
      return 'IoT Studio did not accept the request from Kokoon. Please tell your teacher: the IoT Studio keys need checking.';
    case 'stale_timestamp':
      return "IoT Studio did not accept the request from Kokoon because the server clocks don't match. Please tell your teacher.";
    case 'validation_failed': {
      if (status === 413) return 'This program declares too much for IoT Studio. Remove some IoT variables and try again.';
      if (fieldErrors?.['user.email']) {
        return 'Your email is already used by another IoT Studio account, so it cannot be joined to your Kokoon account automatically. Please ask your teacher or Kokoon support.';
      }
      const first = fieldErrors && Object.entries(fieldErrors)[0];
      return first
        ? `IoT Studio could not accept this program: ${first[0]} ${first[1]}`.slice(0, 240)
        : 'IoT Studio could not accept this program. Check your IoT variable blocks and try again.';
    }
    case 'device_owned_by_other_user':
      return 'This board belongs to another student in IoT Studio. Use one of your own boards.';
    case 'chip_mismatch':
      return 'This board in "My boards" is already set up on a different ESP32. Choose "Replace" to move it to the ESP32 that is plugged in now.';
    case 'chip_in_use':
      return 'The ESP32 that is plugged in is already registered as another board. Pick that board on the Connect block, or remove it from "My boards" first.';
    case 'busy':
      return 'Lots of students are using IoT Studio right now. Wait a few seconds and try again.';
    case 'user_disabled':
      return 'Your IoT Studio account is switched off. Ask your teacher for help.';
    case 'not_found':
      return 'IoT Studio does not know this board yet. Upload a program with the IoT Studio blocks to connect it.';
    case 'integration_disabled':
      return 'IoT Studio is not available right now. Your program was not uploaded.';
    case 'rate_limited':
      return 'IoT Studio is very busy right now. Wait a minute and try again.';
    case 'request_in_progress':
      return 'IoT Studio is still working on your last request. Try again in a moment.';
    case 'unavailable':
      return 'IoT Studio is having trouble right now. Try again in a few minutes.';
    case 'internal_error':
      return `Something went wrong inside IoT Studio${requestId ? ` (reference ${requestId})` : ''}. Try again later.`;
    case 'timeout':
    case 'network_error':
      return "Couldn't reach IoT Studio. Check your internet connection and try again.";
    default:
      return status >= 500 || status === 0
        ? 'IoT Studio is having trouble right now. Try again in a few minutes.'
        : 'IoT Studio could not do that. Try again, or ask your teacher for help.';
  }
};

// The LMS's HTTP status for each IoT Studio error code (anything else: 502)
export const LMS_STATUS_BY_CODE: Record<string, number> = {
  validation_failed: 422,
  device_owned_by_other_user: 409,
  // The board record is on another ESP32: the editor offers "Replace" (replaceChip)
  chip_mismatch: 409,
  // The plugged-in ESP32 is already another board
  chip_in_use: 409,
  user_disabled: 403,
  not_found: 404,
  integration_disabled: 503,
  rate_limited: 503,
  request_in_progress: 503,
  unavailable: 503,
  busy: 503
};

/**
 * An IoT Studio error as the LMS answers it: errorCode IOT_<CODE> (e.g.
 * IOT_CHIP_MISMATCH) and the student's message. This is the wire form of the
 * flash codes chip_mismatch / chip_in_use: the editor drops the IOT_ prefix
 * and lowercases (postkokoon src/utils/iotStudio.ts), so it accepts both.
 */
export const lmsErrorFor = (err: IotStudioError, message?: string): { statusCode: number; errorCode: string; message: string } => ({
  statusCode: LMS_STATUS_BY_CODE[err.code] ?? 502,
  errorCode: `IOT_${err.code.toUpperCase()}`,
  message: message ?? err.studentMessage
});

/** What the student sees for each B1 warning. */
export const WARNING_MESSAGES: Record<string, string> = {
  insufficient_tokens_project_not_created:
    'Your board is connected, but your IoT Studio plan has no tokens left for a new project.',
  project_limit_reached_project_not_created:
    'Your board is connected, but your IoT Studio plan has reached its project limit, so no project was made for this program.',
  variable_limit_reached:
    'Your board is connected, but its IoT Studio project already has as many variables as it can hold. Some variables were not added.'
};

export const warningMessage = (code: string): string =>
  WARNING_MESSAGES[code] ?? `Your board is connected. IoT Studio says: ${code.replace(/_/g, ' ')}.`;

/**
 * The startup check's result: B2 for a board that never exists should end in
 * 404 not_found. `failure` is what that call threw (null: it answered 200).
 * `where` is the API URL without secrets. The message never holds a secret.
 */
export const selfCheckVerdict = (failure: unknown, where: string): { ok: boolean; message: string } => {
  if (failure === null) return { ok: true, message: `IoT Studio integration OK (${where}; the health-check board unexpectedly exists)` };
  if (!(failure instanceof IotStudioError)) {
    return { ok: false, message: `IoT Studio integration check failed at ${where}: ${(failure as Error)?.name ?? 'unknown error'}` };
  }
  const { status, code, detail } = failure;
  const problem = (text: string) => ({ ok: false, message: `IoT Studio integration problem: ${text}` });
  if (status === 404 && code === 'not_found') {
    if (/no lms integration endpoint/i.test(detail ?? '')) {
      return problem(`${where} is IoT Studio, but it has no LMS device endpoint: is IoT Studio up to date?`);
    }
    return { ok: true, message: `IoT Studio integration OK (${where})` };
  }
  if (status === 404) {
    return problem(`${where} answered 404 (${code}): IOT_STUDIO_API_URL must include IoT Studio's API base path, e.g. http://localhost:4004/api/v1`);
  }
  if (code === 'invalid_signature') {
    return problem(`IoT Studio at ${where} rejected the signature: LMS_API_SECRET must be exactly the same as IoT Studio's (or a proxy changes the request path)`);
  }
  if (code === 'stale_timestamp') return problem(`IoT Studio at ${where} says this server's clock is off: sync the clocks (NTP)`);
  if (code === 'integration_disabled') return problem(`IoT Studio at ${where} has its LMS integration switched off`);
  if (status === 0) {
    return problem(`could not reach ${where} (${code}): check the host and port in IOT_STUDIO_API_URL and that IoT Studio is running`);
  }
  if (status === 429) return problem(`IoT Studio at ${where} is rate limiting this server; the check could not finish`);
  return problem(`${where} answered ${status} ${code}: is IOT_STUDIO_API_URL pointing at IoT Studio's API?`);
};

// ── Concurrency cap ──────────────────────────────────────────────────────────

export interface Limiter {
  /** A free slot (resolves to its release), or IotStudioError "busy" when the queue is full or the wait is too long. */
  acquire: (maxWaitMs?: number) => Promise<() => void>;
  readonly active: number;
  readonly waiting: number;
}

/** At most `max` calls at once; up to `maxQueue` more wait, any beyond that fail at once. */
export const createLimiter = (max: number, maxQueue: number): Limiter => {
  let active = 0;
  const queue: { grant: () => void; timer?: ReturnType<typeof setTimeout> }[] = [];
  const busy = () => new IotStudioError(503, 'busy', studentMessageFor(503, 'busy'));
  const release = () => {
    const next = queue.shift();
    if (!next) {
      active--;
      return;
    }
    // The slot passes straight to the next caller
    if (next.timer) clearTimeout(next.timer);
    next.grant();
  };
  const slot = () => {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      release();
    };
  };
  return {
    acquire: (maxWaitMs?: number) => {
      if (active < max) {
        active++;
        return Promise.resolve(slot());
      }
      if (queue.length >= maxQueue || (maxWaitMs !== undefined && maxWaitMs <= 0)) return Promise.reject(busy());
      return new Promise((resolve, reject) => {
        const waiter: (typeof queue)[number] = { grant: () => resolve(slot()) };
        if (maxWaitMs !== undefined) {
          waiter.timer = setTimeout(() => {
            const i = queue.indexOf(waiter);
            if (i >= 0) queue.splice(i, 1);
            reject(busy());
          }, maxWaitMs);
        }
        queue.push(waiter);
      });
    },
    get active() {
      return active;
    },
    get waiting() {
      return queue.length;
    }
  };
};

// ── The client ───────────────────────────────────────────────────────────────

export interface IotStudioClientOptions {
  // IoT Studio API base, e.g. http://localhost:4004/api/v1
  baseUrl: string;
  secret: string;
  timeoutMs?: number;
  maxRetries?: number;
  // Longest Retry-After we wait for; a longer one ends the retries
  maxRetryAfterMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  nowMs?: () => number;
  // Shared cap on open calls (each try holds a slot only while it is on the wire)
  limiter?: Limiter;
  // Where failures are reported (method, path, status, code, IoT Studio's requestId; never bodies)
  onFailure?: (info: { method: string; path: string; status: number; code: string; requestId?: string; attempt: number }) => void;
}

export interface RequestOptions {
  query?: Record<string, string>;
  body?: unknown;
  requestId?: string;
  maxRetries?: number;
  // Absolute time (ms, the client's clock) by which the whole call, retries included, must be over
  deadlineAt?: number;
}

// A try is not started (and a retry not waited for) with less than this left before the deadline
const MIN_ATTEMPT_MS = 1000;

export interface IotResponse<T> {
  status: number;
  data: T;
  // IoT Studio answered from its idempotency memory (same Request-Id seen before)
  replay: boolean;
}

interface ErrorBody {
  error?: { code?: string; message?: string; details?: { fieldErrors?: Record<string, string | string[]>; hardwareId?: unknown } };
  requestId?: string;
}

const retryAfterMs = (header: string | null, nowMs: number): number | null => {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - nowMs) : null;
};

const flattenFieldErrors = (raw?: Record<string, string | string[]>) =>
  raw ? Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)])) : undefined;

export const createIotStudioClient = (o: IotStudioClientOptions) => {
  const fetchImpl = o.fetchImpl ?? fetch;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const nowMs = o.nowMs ?? (() => Date.now());
  const timeoutMs = o.timeoutMs ?? 10_000;
  const maxRetries = o.maxRetries ?? 3;
  const maxRetryAfterMs = o.maxRetryAfterMs ?? 20_000;
  const base = new URL(`${o.baseUrl.replace(/\/+$/, '')}/integrations/lms`);

  /**
   * One signed call. `path` is under /integrations/lms (e.g. "/devices/kk-…").
   * requestId: reuse it to repeat the same action; a new action needs a new one.
   */
  const request = async <T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, opts: RequestOptions = {}): Promise<IotResponse<T>> => {
    const retries = opts.maxRetries ?? maxRetries;
    const url = new URL(`${base.pathname}${path}`, base);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
    const pathWithQuery = `${url.pathname}${url.search}`;
    const rawBody = opts.body === undefined ? '' : JSON.stringify(opts.body);
    const requestId = opts.requestId ?? randomUUID();
    const remaining = () => (opts.deadlineAt === undefined ? Infinity : opts.deadlineAt - nowMs());

    for (let attempt = 0; ; attempt++) {
      if (remaining() <= 0) throw new IotStudioError(0, 'timeout', studentMessageFor(0, 'timeout'));
      // Throws "busy" at once when too many calls are already waiting
      const release = o.limiter ? await o.limiter.acquire(Number.isFinite(remaining()) ? remaining() - MIN_ATTEMPT_MS : undefined) : undefined;
      // A fresh timestamp (and so signature) each try; same Request-Id
      const timestamp = String(Math.floor(nowMs() / 1000));
      const headers: Record<string, string> = {
        'X-Kokoon-Timestamp': timestamp,
        'X-Kokoon-Request-Id': requestId,
        'X-Kokoon-Signature': signRequest(o.secret, timestamp, method, pathWithQuery, rawBody),
        Accept: 'application/json'
      };
      if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

      let status = 0;
      let code = 'network_error';
      let ioRequestId: string | undefined;
      let fieldErrors: Record<string, string> | undefined;
      let detail: string | undefined;
      let otherHardwareId: string | undefined;
      let wait: number | null = null;
      try {
        const res = await fetchImpl(url, {
          method,
          headers,
          body: opts.body === undefined ? undefined : rawBody,
          signal: AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, remaining()))),
          redirect: 'error'
        });
        status = res.status;
        const text = await res.text();
        if (res.ok) {
          let data = null as T;
          if (text) {
            try {
              data = JSON.parse(text) as T;
            } catch {
              throw new IotStudioError(status, 'bad_response', studentMessageFor(502, 'bad_response'));
            }
          }
          return { status, data, replay: res.headers.get('x-kokoon-idempotent-replay') === 'true' };
        }
        let body: ErrorBody = {};
        try {
          body = text ? (JSON.parse(text) as ErrorBody) : {};
        } catch {
          // not JSON (e.g. a proxy's error page)
        }
        code = body.error?.code ?? (status === 429 ? 'rate_limited' : status >= 500 ? 'unavailable' : 'unknown_error');
        ioRequestId = body.requestId;
        fieldErrors = flattenFieldErrors(body.error?.details?.fieldErrors);
        detail = typeof body.error?.message === 'string' ? body.error.message.slice(0, 300) : undefined;
        const other = body.error?.details?.hardwareId;
        otherHardwareId = typeof other === 'string' ? other : undefined;
        wait = retryAfterMs(res.headers.get('retry-after'), nowMs());
      } catch (err) {
        if (err instanceof IotStudioError) throw err;
        const name = (err as Error)?.name;
        code = name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network_error';
      } finally {
        release?.();
      }

      o.onFailure?.({ method, path: url.pathname, status, code, requestId: ioRequestId, attempt });
      const tooLong = wait !== null && wait > maxRetryAfterMs;
      const pause = wait ?? Math.min(4000, 500 * 2 ** attempt) + Math.floor(Math.random() * 200);
      if (attempt < retries && isRetryable(status, code, detail) && !tooLong && remaining() - pause >= MIN_ATTEMPT_MS) {
        await sleep(pause);
        continue;
      }
      throw new IotStudioError(status, code, studentMessageFor(status, code, fieldErrors, ioRequestId), ioRequestId, fieldErrors, detail, otherHardwareId);
    }
  };

  const devicePath = (hardwareId: string) => `/devices/${encodeURIComponent(hardwareId)}`;

  return {
    request,
    /** B1: create or update the board (its variables, program and project). */
    upsertDevice: <T>(
      hardwareId: string,
      body: unknown,
      opts: { rotateCredentials?: boolean; replaceChip?: boolean; requestId?: string; deadlineAt?: number } = {}
    ) => {
      const query: Record<string, string> = {};
      if (opts.rotateCredentials) query.rotateCredentials = 'true';
      // Moves the board to a new chip; IoT Studio rotates its credentials too
      if (opts.replaceChip) query.replaceChip = 'true';
      return request<T>('PUT', devicePath(hardwareId), {
        body,
        requestId: opts.requestId,
        deadlineAt: opts.deadlineAt,
        query: Object.keys(query).length ? query : undefined
      });
    },
    /**
     * B2: the board's connection state (polling callers pass maxRetries: 0:
     * the next poll is the retry, and a short deadlineAt: a stale poll gives
     * up its place in the limiter's queue instead of holding it).
     */
    getDevice: <T>(hardwareId: string, opts: { maxRetries?: number; deadlineAt?: number } = {}) =>
      request<T>('GET', devicePath(hardwareId), { maxRetries: opts.maxRetries, deadlineAt: opts.deadlineAt }),
    /** Many boards' connection state in one call (1 to 200 ids). Read-only: a new Request-Id each time. */
    getDevicesStatus: <T>(hardwareIds: string[], opts: { maxRetries?: number; deadlineAt?: number } = {}) =>
      request<T>('POST', '/devices/status', { body: { hardwareIds }, maxRetries: opts.maxRetries, deadlineAt: opts.deadlineAt }),
    /** B3: switch the board off in IoT Studio and revoke its credentials. */
    deleteDevice: (hardwareId: string, opts: { requestId?: string } = {}) =>
      request<null>('DELETE', devicePath(hardwareId), { requestId: opts.requestId })
  };
};

export type IotStudioClient = ReturnType<typeof createIotStudioClient>;
