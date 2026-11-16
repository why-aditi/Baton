import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Client } from '../src/llm/client';
import { MemoryStore } from '../src/handover/memoryStore';
import { HandoverService, BatonError } from '../src/handover/service';
import type { Caller, Item } from '../src/types';

const boss: Caller = { accountId: 'boss', isAdmin: false };
const meera: Caller = { accountId: 'meera', isAdmin: false };
const stranger: Caller = { accountId: 'stranger', isAdmin: false };
const admin: Caller = { accountId: 'admin', isAdmin: true };
const rec: Caller = { accountId: 'rec', isAdmin: false };

const item = (ari: string, over: Partial<Item> = {}): Item => ({
  ari,
  kind: 'jira_issue',
  title: ari,
  url: `https://x/${ari}`,
  statusCategory: 'in_progress',
  collaborators: [],
  subjectRole: 'assignee',
  ...over,
});

const questionsReply = JSON.stringify({
  questions: Array.from({ length: 5 }, (_, n) => ({ id: `x${n}`, text: `Q${n}?`, itemAris: ['I1'] })),
});

let replies: string[];
let llmCalls: number;
const llm: Client = {
  async complete() {
    llmCalls++;
    const r = replies.shift();
    if (r === undefined) throw new Error('down');
    return { text: r, provider: 'fake' };
  },
};

let store: MemoryStore;
let svc: HandoverService;
let clock: string;

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  replies = [];
  llmCalls = 0;
  clock = '2026-11-16T10:00:00.000Z';
  store = new MemoryStore();
  let n = 0;
  svc = new HandoverService({ store, llm, now: () => clock, newId: () => `h${++n}`, llmCallsPerHour: 20 });
});

const create = (caller = boss, over = {}) =>
  svc.create(caller, {
    subjectAccountId: 'meera',
    subjectName: 'Meera',
    reason: 'leaving',
    lastDay: '2026-11-26',
    recipientAccountIds: ['rec'],
    ...over,
  });

const withInventory = async () => {
  const h = await create();
  return svc.saveInventory(boss, {
    id: h.id,
    items: [item('a'), item('b', { collaborators: ['ari:cloud:identity::user/arjun'], statusCategory: 'todo' })],
    teams: [],
    openAssigned: {},
    people: { meera: 'Meera', arjun: 'Arjun' },
  });
};

describe('create', () => {
  test('creates a draft owned by the caller', async () => {
    const h = await create();
    expect(h).toMatchObject({
      id: 'h1',
      status: 'draft',
      initiatorAccountId: 'boss',
      subjectAri: 'ari:cloud:identity::user/meera',
      items: [],
      createdAt: clock,
    });
  });

  test.each([
    [{ reason: 'fired' }],
    [{ lastDay: '26/11/2026' }],
    [{ subjectAccountId: '' }],
  ])('rejects bad input %j', async (over) => {
    await expect(create(boss, over)).rejects.toMatchObject({ code: 'bad_input' });
  });

  test('you cannot start a handover for yourself', async () => {
    await expect(create(meera)).rejects.toMatchObject({ code: 'bad_input' });
  });
});

describe('list and get', () => {
  test('initiator, recipient, subject and admins see it; others do not', async () => {
    await create();
    for (const c of [boss, rec, meera, admin]) expect(await svc.list(c)).toHaveLength(1);
    expect(await svc.list(stranger)).toEqual([]);
  });

  test('list rows carry progress counts and the caller role, newest first', async () => {
    await create();
    clock = '2026-11-17T00:00:00.000Z';
    await create(boss, { subjectAccountId: 'arjun', subjectName: 'Arjun' });
    const rows = await svc.list(boss);
    expect(rows.map((r) => r.subjectName)).toEqual(['Arjun', 'Meera']);
    expect(rows[0]).toMatchObject({ role: 'editor', itemCount: 0, highCount: 0, questionCount: 0, answeredCount: 0 });
  });

  test('list can filter by status', async () => {
    await create();
    expect(await svc.list(boss, { status: 'ready' })).toEqual([]);
  });

  test('strangers get not_found, never forbidden', async () => {
    const h = await create();
    await expect(svc.get(stranger, h.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(svc.get(boss, 'nope')).rejects.toMatchObject({ code: 'not_found' });
  });

  test('editors get the full handover; the subject gets only their view', async () => {
    const h = await create();
    expect(await svc.get(boss, h.id)).toMatchObject({ role: 'editor', handover: { id: h.id } });
    const view = await svc.get(meera, h.id);
    expect(view).toMatchObject({ role: 'subject', questions: [] });
    expect(view).not.toHaveProperty('handover');
  });
});

describe('saveInventory', () => {
  test('scores items, sorts by risk and sets the input hash', async () => {
    const h = await withInventory();
    expect(h.items.map((i) => [i.ari, i.band])).toEqual([
      ['a', 'high'],
      ['b', 'low'],
    ]);
    expect(h.inputHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('keeps accepted owners for items that are still there', async () => {
    const h = await withInventory();
    await svc.setOwner(boss, { id: h.id, itemAri: 'a', accountId: 'arjun' });
    const again = await svc.saveInventory(boss, {
      id: h.id,
      items: [item('a')],
      teams: [],
      openAssigned: {},
      people: {},
    });
    expect(again.items[0]?.acceptedOwnerAccountId).toBe('arjun');
  });

  test('only editors can save', async () => {
    const h = await create();
    const input = { id: h.id, items: [], teams: [], openAssigned: {}, people: {} };
    await expect(svc.saveInventory(meera, input)).rejects.toMatchObject({ code: 'not_found' });
  });

  test('rejects malformed items', async () => {
    const h = await create();
    const input = { id: h.id, items: [{ ari: 'a' }], teams: [], openAssigned: {}, people: {} };
    await expect(svc.saveInventory(boss, input as never)).rejects.toMatchObject({ code: 'bad_input' });
  });

  test('a published handover cannot be rebuilt', async () => {
    const h = await withInventory();
    await svc.markPublished(boss, { id: h.id, pageId: '1', url: 'https://x/page' });
    const input = { id: h.id, items: [], teams: [], openAssigned: {}, people: {} };
    await expect(svc.saveInventory(boss, input)).rejects.toMatchObject({ code: 'conflict' });
  });
});

describe('questions', () => {
  test('generateQuestions stores them and moves the handover to collecting', async () => {
    const h = await withInventory();
    replies = [questionsReply];
    const out = await svc.generateQuestions(boss, { id: h.id });
    expect(out.status).toBe('collecting');
    expect(out.questions).toHaveLength(5);
    expect(out.questions[0]?.itemAris).toEqual(['a']);
  });

  test('results are cached until the inventory changes', async () => {
    const h = await withInventory();
    replies = [questionsReply, questionsReply];
    await svc.generateQuestions(boss, { id: h.id });
    await svc.generateQuestions(boss, { id: h.id });
    expect(llmCalls).toBe(1);
    await svc.generateQuestions(boss, { id: h.id, regenerate: true });
    expect(llmCalls).toBe(2);
  });

  test('regenerating keeps answers to questions with the same text', async () => {
    const h = await withInventory();
    replies = [questionsReply, questionsReply];
    await svc.generateQuestions(boss, { id: h.id });
    await svc.answer(meera, { id: h.id, questionId: 'q1', answer: 'In the wiki' });
    const out = await svc.generateQuestions(boss, { id: h.id, regenerate: true });
    expect(out.questions[0]?.answer).toBe('In the wiki');
  });

  test('an LLM failure is reported as llm_unavailable', async () => {
    const h = await withInventory();
    await expect(svc.generateQuestions(boss, { id: h.id })).rejects.toMatchObject({ code: 'llm_unavailable' });
  });

  test('the manager can edit, add and delete questions; answers stick by id', async () => {
    const h = await withInventory();
    replies = [questionsReply];
    await svc.generateQuestions(boss, { id: h.id });
    await svc.answer(meera, { id: h.id, questionId: 'q2', answer: 'Ask Lin' });
    const out = await svc.saveQuestions(boss, {
      id: h.id,
      questions: [
        { id: 'q2', text: 'Edited?', itemAris: ['a'] },
        { text: 'Brand new?', itemAris: ['b', 'not-an-item'] },
      ],
    });
    expect(out.questions).toEqual([
      { id: 'q2', text: 'Edited?', itemAris: ['a'], answer: 'Ask Lin' },
      { id: expect.stringMatching(/^q/), text: 'Brand new?', itemAris: ['b'] },
    ]);
  });

  test('only the subject answers, and Done moves the handover to ready', async () => {
    const h = await withInventory();
    replies = [questionsReply];
    await svc.generateQuestions(boss, { id: h.id });
    await expect(svc.answer(boss, { id: h.id, questionId: 'q1', answer: 'x' })).rejects.toMatchObject({
      code: 'not_found',
    });
    const view = await svc.answer(meera, { id: h.id, questionId: 'q1', answer: 'x' });
    expect(view.questions[0]?.answer).toBe('x');
    expect((await svc.finishAnswers(meera, h.id)).status).toBe('ready');
  });

  test('answering an unknown question is bad input', async () => {
    const h = await withInventory();
    await expect(svc.answer(meera, { id: h.id, questionId: 'zz', answer: 'x' })).rejects.toMatchObject({
      code: 'bad_input',
    });
  });

  test('answers are capped at 5000 characters', async () => {
    const h = await withInventory();
    replies = [questionsReply];
    await svc.generateQuestions(boss, { id: h.id });
    await expect(svc.answer(meera, { id: h.id, questionId: 'q1', answer: 'x'.repeat(5001) })).rejects.toMatchObject({
      code: 'bad_input',
    });
  });
});

describe('owners, summary, publish', () => {
  test('setOwner accepts an owner, and null clears it', async () => {
    const h = await withInventory();
    let out = await svc.setOwner(boss, { id: h.id, itemAri: 'a', accountId: 'arjun' });
    expect(out.items.find((i) => i.ari === 'a')?.acceptedOwnerAccountId).toBe('arjun');
    out = await svc.setOwner(boss, { id: h.id, itemAri: 'a', accountId: null });
    expect(out.items.find((i) => i.ari === 'a')?.acceptedOwnerAccountId).toBeUndefined();
  });

  test('setOwner on an unknown item is bad input', async () => {
    const h = await withInventory();
    await expect(svc.setOwner(boss, { id: h.id, itemAri: 'zz', accountId: 'x' })).rejects.toMatchObject({
      code: 'bad_input',
    });
  });

  test('summarizeItems fills one-liners for High and Medium items', async () => {
    const h = await withInventory();
    replies = [JSON.stringify({ items: [{ ari: 'I1', oneLine: 'Retry job' }] })];
    const out = await svc.summarizeItems(boss, h.id);
    expect(out.items.find((i) => i.ari === 'a')?.oneLine).toBe('Retry job');
  });

  test('generateSummary stores the summary, and the editor can edit it', async () => {
    const h = await withInventory();
    replies = [JSON.stringify({ overview: 'o', risks: ['r'], sections: [] })];
    expect((await svc.generateSummary(boss, { id: h.id })).summary?.overview).toBe('o');
    const edited = await svc.updateSummary(boss, { id: h.id, summary: { overview: 'mine', risks: [], sections: [] } });
    expect(edited.summary?.overview).toBe('mine');
  });

  test('markPublished records the page and moves to published', async () => {
    const h = await withInventory();
    const out = await svc.markPublished(boss, { id: h.id, pageId: '42', url: 'https://x/page' });
    expect(out).toMatchObject({ status: 'published', confluencePageId: '42', confluencePageUrl: 'https://x/page' });
  });
});

describe('LLM rate limit', () => {
  test('after the hourly limit, LLM work fails as llm_unavailable without calling the provider', async () => {
    svc = new HandoverService({ store, llm, now: () => clock, newId: () => 'h1', llmCallsPerHour: 1 });
    const h = await withInventory();
    replies = [questionsReply, questionsReply];
    await svc.generateQuestions(boss, { id: h.id });
    await expect(svc.generateQuestions(boss, { id: h.id, regenerate: true })).rejects.toMatchObject({
      code: 'llm_unavailable',
    });
    expect(llmCalls).toBe(1);
  });

  test('the limit resets the next hour', async () => {
    svc = new HandoverService({ store, llm, now: () => clock, newId: () => 'h1', llmCallsPerHour: 1 });
    const h = await withInventory();
    replies = [questionsReply, questionsReply];
    await svc.generateQuestions(boss, { id: h.id });
    clock = '2026-11-16T11:00:00.000Z';
    await svc.generateQuestions(boss, { id: h.id, regenerate: true });
    expect(llmCalls).toBe(2);
  });
});

test('BatonError carries a code', () => {
  expect(new BatonError('not_found', 'x')).toMatchObject({ code: 'not_found', message: 'x' });
});
