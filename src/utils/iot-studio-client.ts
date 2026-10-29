import { createHmac, randomUUID } from 'crypto';

// Server-to-server calls to Kokoon IoT Studio (contract B). Every request is
// signed with LMS_API_SECRET over the exact bytes sent:
//   HMAC-SHA256(secret, timestamp + "." + METHOD + "." + pathWithQuery + "." + rawBody)
// pathWithQuery is the path on the HTTP request line, API base path included
// (/api/v1/integrations/lms/devices/<hardwareId>?rotateCredentials=true).
//
// Network errors, 429 and 5xx (except 503 integration_disabled) are retried
// up to 3 times with the SAME Request-Id, waiting for Retry-After when given.
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
    public readonly fieldErrors?: Record<string, string>
  ) {
    super(`IoT Studio ${status || 'unreachable'} ${code}`);
    this.name = 'IotStudioError';
  }
}

/** Worth trying again with the same Request-Id. */
export const isRetryable = (status: number, code: string): boolean =>
  status === 0 || status === 429 || (status >= 500 && code !== 'integration_disabled');

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

// ── The client ───────────────────────────────────────────────────────────────

export interface IotStudioClientOptions {
  // IoT Studio API base, e.g. http://localhost:4000/api/v1
  baseUrl: string;
  secret: string;
  timeoutMs?: number;
  maxRetries?: number;
  // Longest Retry-After we wait for; a longer one ends the retries
  maxRetryAfterMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  nowMs?: () => number;
  // Where failures are reported (method, path, status, code, IoT Studio's requestId; never bodies)
  onFailure?: (info: { method: string; path: string; status: number; code: string; requestId?: string; attempt: number }) => void;
}

export interface IotResponse<T> {
  status: number;
  data: T;
  // IoT Studio answered from its idempotency memory (same Request-Id seen before)
  replay: boolean;
}

interface ErrorBody {
  error?: { code?: string; message?: string; details?: { fieldErrors?: Record<string, string | string[]> } };
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
  const request = async <T>(
    method: 'GET' | 'PUT' | 'DELETE',
    path: string,
    opts: { query?: Record<string, string>; body?: unknown; requestId?: string; maxRetries?: number } = {}
  ): Promise<IotResponse<T>> => {
    const retries = opts.maxRetries ?? maxRetries;
    const url = new URL(`${base.pathname}${path}`, base);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
    const pathWithQuery = `${url.pathname}${url.search}`;
    const rawBody = opts.body === undefined ? '' : JSON.stringify(opts.body);
    const requestId = opts.requestId ?? randomUUID();

    for (let attempt = 0; ; attempt++) {
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
      let wait: number | null = null;
      try {
        const res = await fetchImpl(url, {
          method,
          headers,
          body: opts.body === undefined ? undefined : rawBody,
          signal: AbortSignal.timeout(timeoutMs),
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
        wait = retryAfterMs(res.headers.get('retry-after'), nowMs());
      } catch (err) {
        if (err instanceof IotStudioError) throw err;
        const name = (err as Error)?.name;
        code = name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network_error';
      }

      o.onFailure?.({ method, path: url.pathname, status, code, requestId: ioRequestId, attempt });
      const tooLong = wait !== null && wait > maxRetryAfterMs;
      if (attempt < retries && isRetryable(status, code) && !tooLong) {
        await sleep(wait ?? Math.min(4000, 500 * 2 ** attempt) + Math.floor(Math.random() * 200));
        continue;
      }
      throw new IotStudioError(status, code, studentMessageFor(status, code, fieldErrors, ioRequestId), ioRequestId, fieldErrors);
    }
  };

  const devicePath = (hardwareId: string) => `/devices/${encodeURIComponent(hardwareId)}`;

  return {
    request,
    /** B1: create or update the board (its variables, program and project). */
    upsertDevice: <T>(hardwareId: string, body: unknown, opts: { rotateCredentials?: boolean; requestId?: string } = {}) =>
      request<T>('PUT', devicePath(hardwareId), {
        body,
        requestId: opts.requestId,
        query: opts.rotateCredentials ? { rotateCredentials: 'true' } : undefined
      }),
    /** B2: the board's connection state (polling callers pass maxRetries: 0: the next poll is the retry). */
    getDevice: <T>(hardwareId: string, opts: { maxRetries?: number } = {}) =>
      request<T>('GET', devicePath(hardwareId), { maxRetries: opts.maxRetries }),
    /** B3: switch the board off in IoT Studio and revoke its credentials. */
    deleteDevice: (hardwareId: string, opts: { requestId?: string } = {}) =>
      request<null>('DELETE', devicePath(hardwareId), { requestId: opts.requestId })
  };
};

export type IotStudioClient = ReturnType<typeof createIotStudioClient>;
