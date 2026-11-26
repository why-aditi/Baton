import { beforeEach, expect, test } from 'vitest';
import { MemoryStore } from '../src/handover/memoryStore';
import { HandoverService } from '../src/handover/service';
import type { Caller } from '../src/types';

const boss: Caller = { accountId: 'boss', isAdmin: false };
const admin: Caller = { accountId: 'admin', isAdmin: true };
const rec: Caller = { accountId: 'rec', isAdmin: false };
const meera: Caller = { accountId: 'meera', isAdmin: false };
const stranger: Caller = { accountId: 'stranger', isAdmin: false };

let store: MemoryStore;
let svc: HandoverService;

beforeEach(async () => {
  store = new MemoryStore();
  let n = 0;
  svc = new HandoverService({
    store,
    llm: { complete: async () => ({ text: '', provider: 'none' }) },
    now: () => '2026-11-26T00:00:00.000Z',
    newId: () => `h${++n}`,
    llmCallsPerHour: 20,
  });
  for (const subject of ['meera', 'arjun']) {
    await svc.create(boss, { subjectAccountId: subject, subjectName: subject, reason: 'leaving', lastDay: '2026-12-30', recipientAccountIds: ['rec'] });
  }
});

test('the person who started a handover deletes it, and only it', async () => {
  expect(await svc.deleteHandover(boss, { id: 'h1' })).toEqual({ deleted: 'h1' });
  expect((await store.listAll()).map((h) => h.id)).toEqual(['h2']);
  expect((await store.listForAccount('meera')).map((h) => h.id)).toEqual([]);
});

test('a Jira admin deletes any handover', async () => {
  expect(await svc.deleteHandover(admin, { id: 'h2' })).toEqual({ deleted: 'h2' });
  expect((await store.listAll()).map((h) => h.id)).toEqual(['h1']);
});

test('a recipient can see it but not delete it', async () => {
  await expect(svc.deleteHandover(rec, { id: 'h1' })).rejects.toMatchObject({ code: 'bad_input' });
  expect(await store.listAll()).toHaveLength(2);
});

test('the departing person and strangers get not_found', async () => {
  await expect(svc.deleteHandover(meera, { id: 'h1' })).rejects.toMatchObject({ code: 'not_found' });
  await expect(svc.deleteHandover(stranger, { id: 'h1' })).rejects.toMatchObject({ code: 'not_found' });
  expect(await store.listAll()).toHaveLength(2);
});

test('an unknown or missing id is not_found', async () => {
  await expect(svc.deleteHandover(boss, { id: 'nope' })).rejects.toMatchObject({ code: 'not_found' });
  await expect(svc.deleteHandover(boss, {})).rejects.toMatchObject({ code: 'not_found' });
});
