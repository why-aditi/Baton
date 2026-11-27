import { beforeEach, expect, test } from 'vitest';
import { MemoryStore } from '../src/handover/memoryStore';
import { HandoverService } from '../src/handover/service';
import type { Caller, Item } from '../src/types';

const boss: Caller = { accountId: 'boss', isAdmin: false };
const meera: Caller = { accountId: 'meera', isAdmin: false };
const ARJUN = 'ari:cloud:identity::user/arjun';

const item = (n: number, over: Partial<Item> = {}): Item => ({
  ari: `ari:cloud:jira:c:issue/${n}`,
  kind: 'jira_issue',
  title: `Issue ${n}`,
  url: `https://x/browse/PAY-${n}`,
  key: `PAY-${n}`,
  statusCategory: 'todo',
  collaborators: [ARJUN],
  subjectRole: 'assignee',
  ...over,
});

let svc: HandoverService;
let store: MemoryStore;
let id: string;

beforeEach(async () => {
  store = new MemoryStore();
  let n = 0;
  svc = new HandoverService({
    store,
    llm: { complete: async () => ({ text: '', provider: 'none' }) },
    now: () => '2026-11-27T00:00:00.000Z',
    newId: () => `h${++n}`,
    llmCallsPerHour: 20,
  });
  id = (await svc.create(boss, { subjectAccountId: 'meera', subjectName: 'Meera Iyer', reason: 'leaving', lastDay: '2026-12-30' })).id;
  // Published with three items: 1 (low), 2 (mid-flight, owner accepted), 3 (Meera only).
  await svc.saveInventory(boss, {
    id,
    items: [item(1), item(2, { statusCategory: 'in_progress' }), item(3, { collaborators: [] })],
    people: { arjun: 'Arjun Rao' },
  });
  await svc.setOwner(boss, { id, itemAri: 'ari:cloud:jira:c:issue/2', accountId: 'arjun' });
  await svc.markPublished(boss, { id, pageId: '9', url: 'https://x/page' });
});

test('sorts a fresh read into new, gone and still open, with the risk then and now', async () => {
  // Now: 2 was handed over (gone from Meera's work), 3 became mid-flight, 4 is new.
  const diff = await svc.compareInventory(boss, {
    id,
    items: [item(1), item(3, { collaborators: [], statusCategory: 'in_progress' }), item(4, { collaborators: [], title: 'New thing' })],
  });
  expect(diff.added.map((x) => [x.key, x.band])).toEqual([['PAY-4', 'medium']]);
  expect(diff.gone).toEqual([
    { ari: 'ari:cloud:jira:c:issue/2', kind: 'jira_issue', title: 'Issue 2', key: 'PAY-2', url: 'https://x/browse/PAY-2', newOwner: 'Arjun Rao' },
  ]);
  expect(diff.stillOpen.map((x) => [x.key, x.riskBefore, x.riskNow, x.bandNow])).toEqual([
    ['PAY-3', 40, 60, 'high'],
    ['PAY-1', 20, 20, 'low'],
  ]);
  expect(diff.stillOpen[0]?.reasons).toEqual(['Only Meera Iyer has worked on this', 'Work is mid-flight']);
});

test('gone items with no accepted owner say so', async () => {
  const diff = await svc.compareInventory(boss, { id, items: [item(1), item(2, { statusCategory: 'in_progress' })] });
  expect(diff.gone).toEqual([expect.objectContaining({ key: 'PAY-3', newOwner: null })]);
});

test('changes nothing stored', async () => {
  const before = JSON.stringify(await store.get(id));
  await svc.compareInventory(boss, { id, items: [item(9)] });
  expect(JSON.stringify(await store.get(id))).toBe(before);
});

test('only for published handovers', async () => {
  const other = (await svc.create(boss, { subjectAccountId: 'lin', subjectName: 'Lin', reason: 'leave', lastDay: '2026-12-30' })).id;
  await expect(svc.compareInventory(boss, { id: other, items: [] })).rejects.toMatchObject({ code: 'conflict' });
});

test('only editors: the departing person gets not_found', async () => {
  await expect(svc.compareInventory(meera, { id, items: [] })).rejects.toMatchObject({ code: 'not_found' });
});

test('rejects malformed items', async () => {
  await expect(svc.compareInventory(boss, { id, items: [{ ari: 'x' }] })).rejects.toMatchObject({ code: 'bad_input' });
});
