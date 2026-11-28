// A handover is stored as one Forge custom-entity value, capped at 240 KiB (RAW):
// https://developer.atlassian.com/platform/forge/limits-kvs-ce/
import { expect, test } from 'vitest';
import { MAX_ITEMS, MAX_STORED_BYTES, storedBytes } from '../src/handover/service';
import { makeHandover, scored } from './helpers';

const LIMIT = 240 * 1024;
const acct = (n: number) => `712020:${String(n).padStart(8, '0')}-44a5-4ef8-9627-41140c0812b6`;
const user = (n: number) => `ari:cloud:identity::user/${acct(n)}`;

// Real-world shape: long ARIs and URLs, a full title, three reasons, three owner suggestions, five
// collaborators, a one-liner. Heavier than anything on the demo site.
const heavyItem = (n: number) =>
  scored(`ari:cloud:jira:7251940d-1e14-4314-b9e9-647e62148c96:issue/${100000 + n}`, {
    key: `PAY-${n}`,
    title: `Payment retry: exponential backoff for card declines, item ${n}`.padEnd(120, '.'),
    url: `https://one-atlas-ubvd.atlassian.net/browse/PAY-${n}`,
    status: 'In Progress',
    statusCategory: 'in_progress',
    updatedAt: '2026-11-23T11:23:39.482Z',
    dueDate: '2027-01-02',
    container: 'PAY',
    collaborators: [1, 2, 3, 4, 5].map(user),
    risk: 75,
    band: 'high',
    reasons: ['Only Meera Iyer has worked on this', 'Work is mid-flight', 'Due soon after they leave'],
    suggestions: [1, 2, 3].map((k) => ({ accountId: acct(k), score: 3, reason: 'In Payments, worked on 2 other items in PAY' })),
    oneLine: 'PAY-1 implements exponential backoff for declined cards; crucial for retry handling.',
  });

const heavy = (items: number) =>
  makeHandover({
    items: Array.from({ length: items }, (_, n) => heavyItem(n)),
    questions: Array.from({ length: 10 }, (_, n) => ({
      id: `q${n + 1}`,
      text: 'Where are the staging credentials for the payments retry job documented?',
      itemAris: [heavyItem(n).ari],
      answer: 'x'.repeat(5000),
    })),
    people: Object.fromEntries(Array.from({ length: 40 }, (_, n) => [acct(n), `Person ${n}`])),
  });

test('a large handover (100 heavy items, 10 maximum-length answers) still fits under the guard', () => {
  // Measured Nov 28: about 194 KiB, so heavy items cost about 1.5 KB each and the real ceiling is ~140.
  expect(storedBytes(heavy(100))).toBeLessThan(MAX_STORED_BYTES);
});

test('the guard sits below the platform limit, and the item cap alone would not keep us under it', () => {
  expect(MAX_STORED_BYTES).toBeLessThan(LIMIT);
  // Why the guard exists: at the schema's item cap, heavy items overflow the 240 KiB value limit.
  expect(storedBytes(heavy(MAX_ITEMS))).toBeGreaterThan(LIMIT);
});

test('saving a handover over the limit is refused with a clear message, and nothing is stored', async () => {
  const { HandoverService } = await import('../src/handover/service');
  const { MemoryStore } = await import('../src/handover/memoryStore');
  const store = new MemoryStore();
  const svc = new HandoverService({ store, now: () => '2026-11-28T00:00:00.000Z' } as never);
  await expect((svc as unknown as { save: (h: unknown) => Promise<unknown> }).save(heavy(MAX_ITEMS))).rejects.toThrow(/too big to save/);
  expect(await store.get('h1')).toBeUndefined();
});
