import { beforeEach, expect, test } from 'vitest';
import { MemoryStore } from '../src/handover/memoryStore';
import { HandoverService } from '../src/handover/service';
import type { Caller, Item } from '../src/types';

const boss: Caller = { accountId: 'boss', isAdmin: false };
const meera: Caller = { accountId: 'meera', isAdmin: false };
const stranger: Caller = { accountId: 'stranger', isAdmin: false };
const ISSUE = 'ari:cloud:jira:c:issue/42';

const issue = (over: Partial<Item> = {}): Item => ({
  ari: ISSUE,
  kind: 'jira_issue',
  title: 'Retry backoff',
  url: 'https://x/browse/PAY-1',
  key: 'PAY-1',
  statusCategory: 'in_progress',
  collaborators: [],
  subjectRole: 'assignee',
  ...over,
});

let svc: HandoverService;

beforeEach(async () => {
  let n = 0;
  svc = new HandoverService({
    store: new MemoryStore(),
    llm: { complete: async () => ({ text: '', provider: 'none' }) },
    now: () => '2026-11-27T00:00:00.000Z',
    newId: () => `h${++n}`,
    llmCallsPerHour: 20,
  });
  const h = await svc.create(boss, { subjectAccountId: 'meera', subjectName: 'Meera Iyer', reason: 'leaving', lastDay: '2026-12-30' });
  await svc.saveInventory(boss, {
    id: h.id,
    items: [issue(), issue({ ari: 'ari:cloud:jira:c:issue/43', key: 'PAY-2', collaborators: ['ari:cloud:identity::user/arjun'] })],
    people: { arjun: 'Arjun Rao' },
  });
  await svc.setOwner(boss, { id: h.id, itemAri: 'ari:cloud:jira:c:issue/43', accountId: 'arjun' });
});

test('finds the issue by its ID and describes the handover and the item', async () => {
  expect(await svc.issueHandovers(boss, { issueId: '42' })).toEqual([
    {
      handoverId: 'h1',
      subjectName: 'Meera Iyer',
      reason: 'leaving',
      lastDay: '2026-12-30',
      status: 'draft',
      risk: 60,
      band: 'high',
      reasons: ['Only Meera Iyer has worked on this', 'Work is mid-flight'],
      newOwner: null,
      ownerStatus: 'none',
    },
  ]);
});

test('finds the issue by key when there is no ID, and reports an accepted owner', async () => {
  const [m] = await svc.issueHandovers(boss, { issueKey: 'pay-2' });
  expect(m).toMatchObject({ handoverId: 'h1', newOwner: { accountId: 'arjun', name: 'Arjun Rao' }, ownerStatus: 'accepted' });
});

test('an issue in no handover gives an empty list', async () => {
  expect(await svc.issueHandovers(boss, { issueId: '999' })).toEqual([]);
});

test('the departing person and strangers see nothing', async () => {
  expect(await svc.issueHandovers(meera, { issueId: '42' })).toEqual([]);
  expect(await svc.issueHandovers(stranger, { issueId: '42' })).toEqual([]);
});

test('needs an issue ID or key', async () => {
  await expect(svc.issueHandovers(boss, {})).rejects.toMatchObject({ code: 'bad_input' });
});
