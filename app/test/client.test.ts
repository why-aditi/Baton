import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createClient, completeValidated, type FetchLike, type Provider } from '../src/llm/client';

const providers: Provider[] = [
  { name: 'groq', baseUrl: 'https://groq.test/v1', apiKey: 'gk', models: { fast: 'g-small', large: 'g-big' } },
  { name: 'mistral', baseUrl: 'https://mistral.test/v1', apiKey: 'mk', models: { fast: 'm-small', large: 'm-big' } },
];

type Call = { url: string; headers: Record<string, string>; body: any };

/** A fake fetch that answers each call from a list of responses (a status + content, or a thrown error). */
const fakeFetch = (responses: (Error | { status: number; content?: string })[]) => {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const r = responses.shift();
    if (!r) throw new Error('unexpected call');
    if (r instanceof Error) throw r;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => ({ choices: [{ message: { content: r.content ?? '' } }] }),
      text: async () => `status ${r.status}`,
    };
  };
  return { fetch, calls };
};

const messages = [{ role: 'user' as const, content: 'hi' }];

describe('complete', () => {
  test('calls the first provider with its key, the tier model and JSON mode', async () => {
    const { fetch, calls } = fakeFetch([{ status: 200, content: '{"ok":true}' }]);
    const res = await createClient({ fetch, providers }).complete({ tier: 'large', messages });
    expect(res).toEqual({ text: '{"ok":true}', provider: 'groq' });
    expect(calls[0]?.url).toBe('https://groq.test/v1/chat/completions');
    expect(calls[0]?.headers.Authorization).toBe('Bearer gk');
    expect(calls[0]?.body).toMatchObject({ model: 'g-big', messages, response_format: { type: 'json_object' } });
  });

  test.each([429, 500, 503, 400])('a %i moves on to the next provider', async (status) => {
    const { fetch, calls } = fakeFetch([{ status }, { status: 200, content: '{}' }]);
    const res = await createClient({ fetch, providers }).complete({ tier: 'fast', messages });
    expect(res.provider).toBe('mistral');
    expect(calls[1]?.body.model).toBe('m-small');
  });

  test('a network error moves on to the next provider', async () => {
    const { fetch } = fakeFetch([new Error('ECONNRESET'), { status: 200, content: '{}' }]);
    expect((await createClient({ fetch, providers }).complete({ tier: 'fast', messages })).provider).toBe('mistral');
  });

  test('providers without a key are skipped', async () => {
    const { fetch, calls } = fakeFetch([{ status: 200, content: '{}' }]);
    const noGroqKey = [{ ...providers[0]!, apiKey: undefined }, providers[1]!];
    await createClient({ fetch, providers: noGroqKey }).complete({ tier: 'fast', messages });
    expect(calls.map((c) => c.url)).toEqual(['https://mistral.test/v1/chat/completions']);
  });

  test('when every provider fails, the error names each failure', async () => {
    const { fetch } = fakeFetch([{ status: 429 }, new Error('ECONNRESET')]);
    await expect(createClient({ fetch, providers }).complete({ tier: 'fast', messages })).rejects.toThrow(
      /groq: HTTP 429.*mistral: ECONNRESET/,
    );
  });
});

describe('completeValidated', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  const known = new Set(['a1']);
  const good = JSON.stringify({ items: [{ ari: 'a1', oneLine: 'Retry job' }] });
  const bad = JSON.stringify({ items: [{ ari: 'zz', oneLine: 'Invented' }] });
  const run = (fetch: FetchLike) =>
    completeValidated(createClient({ fetch, providers }), { task: 'itemSummaries', tier: 'fast', messages, known });

  test('returns the validated value', async () => {
    const { fetch } = fakeFetch([{ status: 200, content: good }]);
    expect(await run(fetch)).toEqual({ items: [{ ari: 'a1', oneLine: 'Retry job' }] });
  });

  test('retries once, sending back the bad output and the error', async () => {
    const { fetch, calls } = fakeFetch([
      { status: 200, content: bad },
      { status: 200, content: good },
    ]);
    expect(await run(fetch)).toEqual({ items: [{ ari: 'a1', oneLine: 'Retry job' }] });
    const retry = calls[1]?.body.messages;
    expect(retry.at(-2)).toEqual({ role: 'assistant', content: bad });
    expect(retry.at(-1).content).toContain('zz');
  });

  test('returns null when the retry is also invalid', async () => {
    const { fetch } = fakeFetch([
      { status: 200, content: bad },
      { status: 200, content: bad },
    ]);
    expect(await run(fetch)).toBeNull();
  });

  test('returns null when no provider answers, so the flow is never blocked', async () => {
    const { fetch } = fakeFetch([{ status: 500 }, { status: 500 }]);
    expect(await run(fetch)).toBeNull();
  });
});
