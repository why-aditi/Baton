import { beforeEach, expect, test, vi } from 'vitest';
import { completeValidated } from '../src/llm/client';
import { createForgeLlmClient, type ForgeChat, type ForgeList } from '../src/llm/forgeLlm';

const models = [
  { model: 'claude-old-haiku', status: 'deprecated', class: 'haiku' },
  { model: 'claude-haiku-x', status: 'active', class: 'haiku' },
  { model: 'claude-sonnet-x', status: 'active', class: 'sonnet' },
  { model: 'claude-opus-x', status: 'active', class: 'opus' },
];

let prompts: any[];
let listCalls: number;
const list: ForgeList = async () => {
  listCalls++;
  return { models } as never;
};
const reply = (content: unknown): ForgeChat => async (prompt) => {
  prompts.push(prompt);
  return { choices: [{ finish_reason: 'end_turn', message: { role: 'assistant', content } }] } as never;
};
const messages = [
  { role: 'system' as const, content: 'Reply with JSON.' },
  { role: 'user' as const, content: '{"items":[]}' },
];

beforeEach(() => {
  prompts = [];
  listCalls = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

test('fast work uses the active Haiku-class model', async () => {
  const llm = createForgeLlmClient({ chat: reply('{"ok":true}'), list });
  expect(await llm.complete({ tier: 'fast', messages })).toEqual({ text: '{"ok":true}', provider: 'forge' });
  expect(prompts[0].model).toBe('claude-haiku-x');
});

test('large work uses the active Sonnet-class model', async () => {
  const llm = createForgeLlmClient({ chat: reply('{}'), list });
  await llm.complete({ tier: 'large', messages });
  expect(prompts[0].model).toBe('claude-sonnet-x');
});

test('sends the messages as given, with a token cap and low temperature', async () => {
  const llm = createForgeLlmClient({ chat: reply('{}'), list });
  await llm.complete({ tier: 'large', messages });
  expect(prompts[0]).toMatchObject({ messages, max_completion_tokens: 4000, temperature: 0.2 });
});

test('joins text parts when the reply comes as a list', async () => {
  const llm = createForgeLlmClient({
    chat: reply([
      { type: 'text', text: '{"a":' },
      { type: 'text', text: '1}' },
    ]),
    list,
  });
  expect((await llm.complete({ tier: 'fast', messages })).text).toBe('{"a":1}');
});

test('looks the models up once per client', async () => {
  const llm = createForgeLlmClient({ chat: reply('{}'), list });
  await llm.complete({ tier: 'fast', messages });
  await llm.complete({ tier: 'large', messages });
  expect(listCalls).toBe(1);
});

test('falls back to the other class when one has no active model', async () => {
  const onlySonnet: ForgeList = async () => ({ models: [models[2]] }) as never;
  const llm = createForgeLlmClient({ chat: reply('{}'), list: onlySonnet });
  await llm.complete({ tier: 'fast', messages });
  expect(prompts[0].model).toBe('claude-sonnet-x');
});

test('no active model at all is an error', async () => {
  const none: ForgeList = async () => ({ models: [models[0]] }) as never;
  const llm = createForgeLlmClient({ chat: reply('{}'), list: none });
  await expect(llm.complete({ tier: 'fast', messages })).rejects.toThrow(/No active Forge LLM model/);
});

test('an empty reply is an error', async () => {
  const llm = createForgeLlmClient({ chat: reply([]), list });
  await expect(llm.complete({ tier: 'fast', messages })).rejects.toThrow(/empty/);
});

test('through completeValidated, a Forge LLM failure returns null so the flow is never blocked', async () => {
  const failing: ForgeChat = async () => {
    throw new Error('FORGE_API_ERROR');
  };
  const llm = createForgeLlmClient({ chat: failing, list });
  expect(await completeValidated(llm, { task: 'itemSummaries', tier: 'fast', messages, known: new Set() })).toBeNull();
});
