import { beforeEach, expect, test, vi } from 'vitest';
import { MemoryStore } from '../src/handover/memoryStore';
import { HandoverService, type AtlassianPort } from '../src/handover/service';
import type { Caller, Item } from '../src/types';

const boss: Caller = { accountId: 'boss', isAdmin: false };
const ISSUE = 'ari:cloud:jira:c:issue/42';

const issue = (over: Partial<Item> = {}): Item => ({
  ari: ISSUE,
  kind: 'jira_issue',
  title: 'Retry backoff',
  url: 'https://x/PAY-42',
  key: 'PAY-42',
  statusCategory: 'todo',
  collaborators: ['ari:cloud:identity::user/a', 'ari:cloud:identity::user/b'],
  subjectRole: 'assignee',
  ...over,
});

const port = (issueDetails?: AtlassianPort['issueDetails']): AtlassianPort => ({
  createPage: async () => ({ pageId: '1', url: 'u' }),
  assignIssue: async () => {},
  issueDetails,
});

const setup = async (atlassian?: AtlassianPort) => {
  const svc = new HandoverService({
    store: new MemoryStore(),
    llm: { complete: async () => ({ text: '', provider: 'none' }) },
    now: () => '2026-11-22T00:00:00.000Z',
    newId: () => 'h1',
    llmCallsPerHour: 20,
    atlassian,
  });
  const h = await svc.create(boss, { subjectAccountId: 'meera', subjectName: 'Meera', reason: 'leaving', lastDay: '2026-11-26' });
  return { svc, id: h.id };
};

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

test('fills the updated date and sprint end from Jira, so stale and sprint signals fire', async () => {
  const asked: string[][] = [];
  const { svc, id } = await setup(
    port(async (ids) => {
      asked.push(ids);
      return { '42': { updatedAt: '2026-09-01T00:00:00.000Z', sprintEndDate: '2026-11-28' } };
    }),
  );
  const h = await svc.saveInventory(boss, { id, items: [issue()] });
  expect(asked).toEqual([['42']]);
  expect(h.items[0]).toMatchObject({ updatedAt: '2026-09-01T00:00:00.000Z', sprintEndDate: '2026-11-28' });
  expect(h.items[0]?.reasons).toEqual(['Stale, so context is likely only in their head', 'Due soon after they leave']);
});

test('only Jira issues are looked up', async () => {
  const asked: string[][] = [];
  const { svc, id } = await setup(port(async (ids) => (asked.push(ids), {})));
  await svc.saveInventory(boss, { id, items: [issue({ ari: 'ari:cloud:confluence:c:page/1', kind: 'confluence_page' })] });
  expect(asked).toEqual([]);
});

test('a failing lookup still saves the inventory from the graph alone', async () => {
  const { svc, id } = await setup(
    port(async () => {
      throw new Error('Jira down');
    }),
  );
  const h = await svc.saveInventory(boss, { id, items: [issue()] });
  expect(h.items).toHaveLength(1);
  expect(h.items[0]?.updatedAt).toBeUndefined();
});

test('works without the lookup configured', async () => {
  const { svc, id } = await setup(port());
  expect((await svc.saveInventory(boss, { id, items: [issue()] })).items).toHaveLength(1);
});
