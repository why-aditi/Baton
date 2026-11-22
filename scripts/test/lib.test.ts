import { describe, expect, test } from 'vitest';
import { loadConfig } from '../seed/lib/config';
import { HttpError, isNotFound, makeHttp, type FetchLike } from '../seed/lib/http';

const response = (status: number, body = '', headers: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (n: string) => headers[n] ?? null },
  text: async () => body,
});

describe('makeHttp', () => {
  test('sends basic auth and JSON, and parses the reply', async () => {
    const calls: any[] = [];
    const fetch: FetchLike = async (url, init) => (calls.push({ url, init }), response(200, '{"a":1}'));
    const http = makeHttp({ fetch, baseUrl: 'https://site', email: 'e@x', token: 't' });
    expect(await http.json('POST', '/p', { b: 2 })).toEqual({ a: 1 });
    expect(calls[0].url).toBe('https://site/p');
    expect(calls[0].init.headers.Authorization).toBe(`Basic ${Buffer.from('e@x:t').toString('base64')}`);
    expect(calls[0].init.headers['Content-Type']).toBe('application/json');
    expect(calls[0].init.body).toBe('{"b":2}');
  });

  test('an empty reply is undefined', async () => {
    const http = makeHttp({ fetch: async () => response(204), baseUrl: '', email: '', token: '' });
    expect(await http.json('PUT', '/p', {})).toBeUndefined();
  });

  test('form posts are url-encoded', async () => {
    let init: any;
    const http = makeHttp({ fetch: async (_u, i) => ((init = i), response(201, '{}')), baseUrl: '', email: '', token: '' });
    await http.form('/src', { message: 'a b', 'docs/x.md': 'hi' });
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(init.body).toBe('message=a+b&docs%2Fx.md=hi');
  });

  test('retries a 429 after Retry-After, then succeeds', async () => {
    const replies = [response(429, '', { 'Retry-After': '3' }), response(200, '{}')];
    const waits: number[] = [];
    const http = makeHttp({ fetch: async () => replies.shift()!, baseUrl: '', email: '', token: '', sleep: async (ms) => void waits.push(ms) });
    await http.json('GET', '/p');
    expect(waits).toEqual([3000]);
  });

  test('other failures throw an HttpError with the status', async () => {
    const http = makeHttp({ fetch: async () => response(404, 'nope'), baseUrl: '', email: '', token: '' });
    const err = await http.json('GET', '/p').catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(isNotFound(err)).toBe(true);
    expect(err.message).toContain('GET /p → HTTP 404');
  });
});

describe('loadConfig', () => {
  const full = () => {
    const env: Record<string, string> = { SEED_SITE: 'https://demo.atlassian.net/', SEED_BITBUCKET_WORKSPACE: 'demo' };
    for (const u of ['MEERA', 'ARJUN', 'LIN', 'PRIYA', 'SAM', 'DANA', 'OMAR']) {
      env[`SEED_${u}_EMAIL`] = `${u.toLowerCase()}@x`;
      env[`SEED_${u}_TOKEN`] = `tok-${u}`;
    }
    return env;
  };

  test('reads users, defaults and a bare site host', () => {
    const c = loadConfig({ ...full(), SEED_ARJUN_BITBUCKET_TOKEN: 'bb' });
    expect(c).toMatchObject({ site: 'demo.atlassian.net', lastDay: '2026-12-30', spaceKey: 'NWP', issueType: 'Task', workspace: 'demo' });
    expect(c.users.meera).toEqual({ email: 'meera@x', token: 'tok-MEERA', bitbucketToken: 'tok-MEERA' });
    expect(c.users.arjun.bitbucketToken).toBe('bb');
  });

  test('names every missing setting', () => {
    const env = full();
    delete env.SEED_SITE;
    delete env.SEED_LIN_TOKEN;
    expect(() => loadConfig(env)).toThrow(/SEED_LIN_TOKEN, SEED_SITE/);
  });

  test('rejects a badly formatted last day', () => {
    expect(() => loadConfig({ ...full(), SEED_LAST_DAY: '30/12/2026' })).toThrow(/SEED_LAST_DAY/);
  });
});
