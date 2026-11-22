// A tiny JSON-over-HTTP client with basic auth (email + API token) and 429 retries.

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    readonly body: string,
  ) {
    super(`${method} ${path} → HTTP ${status}: ${body.slice(0, 300)}`);
  }
}

export type Http = {
  json<T = any>(method: string, path: string, body?: unknown): Promise<T>;
  /** Form-encoded POST (Bitbucket's /src endpoint). */
  form<T = any>(path: string, fields: Record<string, string>): Promise<T>;
};

export const makeHttp = (opts: {
  fetch: FetchLike;
  baseUrl: string;
  email: string;
  token: string;
  sleep?: (ms: number) => Promise<void>;
}): Http => {
  const auth = `Basic ${Buffer.from(`${opts.email}:${opts.token}`).toString('base64')}`;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  const send = async (method: string, path: string, body: string | undefined, contentType: string) => {
    for (let attempt = 0; ; attempt++) {
      const res = await opts.fetch(`${opts.baseUrl}${path}`, {
        method,
        headers: { Authorization: auth, Accept: 'application/json', ...(body !== undefined && { 'Content-Type': contentType }) },
        body,
      });
      if (res.status === 429 && attempt < 4) {
        const wait = Number(res.headers.get('Retry-After')) || 2 ** attempt;
        await sleep(wait * 1000);
        continue;
      }
      const text = await res.text();
      if (!res.ok) throw new HttpError(res.status, method, path, text);
      return text ? JSON.parse(text) : undefined;
    }
  };

  return {
    json: (method, path, body) => send(method, path, body === undefined ? undefined : JSON.stringify(body), 'application/json'),
    form: (path, fields) => send('POST', path, new URLSearchParams(fields).toString(), 'application/x-www-form-urlencoded'),
  };
};

/** True for a 404, so callers can treat "not there" as a normal answer. */
export const isNotFound = (e: unknown) => e instanceof HttpError && e.status === 404;
