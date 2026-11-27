import { beforeEach, describe, expect, test, vi } from 'vitest';
import { completeValidated, type Client, type Message } from '../src/llm/client';

const messages: Message[] = [{ role: 'user', content: 'hi' }];

/** A fake Client answering from a list of replies (a string, or an Error to throw); records every call. */
const fakeClient = (replies: (string | Error)[]) => {
  const calls: Message[][] = [];
  const client: Client = {
    async complete({ messages: m }) {
      calls.push(m);
      const r = replies.shift();
      if (r === undefined) throw new Error('unexpected call');
      if (r instanceof Error) throw r;
      return { text: r, provider: 'fake' };
    },
  };
  return { client, calls };
};

describe('completeValidated', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  const known = new Set(['a1']);
  const good = JSON.stringify({ items: [{ ari: 'a1', oneLine: 'Retry job' }] });
  const bad = JSON.stringify({ items: [{ ari: 'zz', oneLine: 'Invented' }] });
  const run = (client: Client) => completeValidated(client, { task: 'itemSummaries', tier: 'fast', messages, known });

  test('returns the validated value', async () => {
    expect(await run(fakeClient([good]).client)).toEqual({ items: [{ ari: 'a1', oneLine: 'Retry job' }] });
  });

  test('retries once, sending back the bad output and the error', async () => {
    const { client, calls } = fakeClient([bad, good]);
    expect(await run(client)).toEqual({ items: [{ ari: 'a1', oneLine: 'Retry job' }] });
    const retry = calls[1]!;
    expect(retry.at(-2)).toEqual({ role: 'assistant', content: bad });
    expect(retry.at(-1)!.content).toContain('zz');
  });

  test('returns null when the retry is also invalid', async () => {
    expect(await run(fakeClient([bad, bad]).client)).toBeNull();
  });

  test('returns null when the LLM fails, so the flow is never blocked', async () => {
    expect(await run(fakeClient([new Error('down')]).client)).toBeNull();
  });
});
