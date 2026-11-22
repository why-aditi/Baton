import { beforeEach, expect, test } from 'vitest';
import { MemoryStore } from '../src/handover/memoryStore';
import { HandoverService } from '../src/handover/service';
import type { Caller } from '../src/types';

const boss: Caller = { accountId: 'boss', isAdmin: false };
const admin: Caller = { accountId: 'admin', isAdmin: true };

let store: MemoryStore;
let svc: HandoverService;

beforeEach(async () => {
  store = new MemoryStore();
  let n = 0;
  svc = new HandoverService({
    store,
    llm: { complete: async () => ({ text: '', provider: 'none' }) },
    now: () => '2026-11-22T00:00:00.000Z',
    newId: () => `h${++n}`,
    llmCallsPerHour: 20,
  });
  for (const subject of ['meera', 'arjun']) {
    await svc.create(boss, { subjectAccountId: subject, subjectName: subject, reason: 'leaving', lastDay: '2026-12-30' });
  }
});

test('a Jira admin deletes every handover on the site', async () => {
  expect(await svc.deleteAllHandovers(admin, { confirm: 'DELETE' })).toEqual({ deleted: 2 });
  expect(await store.listAll()).toEqual([]);
  expect(await store.listForAccount('boss')).toEqual([]);
});

test('anyone else gets not_found, and nothing is deleted', async () => {
  await expect(svc.deleteAllHandovers(boss, { confirm: 'DELETE' })).rejects.toMatchObject({ code: 'not_found' });
  expect(await store.listAll()).toHaveLength(2);
});

test('without the confirmation word it refuses', async () => {
  await expect(svc.deleteAllHandovers(admin, {})).rejects.toMatchObject({ code: 'bad_input' });
  await expect(svc.deleteAllHandovers(admin, { confirm: 'delete' })).rejects.toMatchObject({ code: 'bad_input' });
  expect(await store.listAll()).toHaveLength(2);
});
