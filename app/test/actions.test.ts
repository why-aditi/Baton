import { beforeEach, describe, expect, test } from 'vitest';
import { Actions, compact } from '../src/actions';
import { MemoryStore } from '../src/handover/memoryStore';
import { HandoverService } from '../src/handover/service';
import type { Caller, Item } from '../src/types';

const boss: Caller = { accountId: 'boss', isAdmin: false };
const meera: Caller = { accountId: 'meera', isAdmin: false };
const stranger: Caller = { accountId: 'stranger', isAdmin: false };

const item = (ari: string, over: Partial<Item> = {}): Item => ({
  ari,
  kind: 'jira_issue',
  title: ari,
  url: `https://site/${ari}`,
  statusCategory: 'in_progress',
  collaborators: [],
  subjectRole: 'assignee',
  ...over,
});

let svc: HandoverService;
let actions: Actions;
let handoverId: string;

const people = [
  { accountId: 'meera', name: 'Meera Iyer' },
  { accountId: 'arjun', name: 'Arjun Rao' },
];

beforeEach(async () => {
  let n = 0;
  svc = new HandoverService({
    store: new MemoryStore(),
    llm: { complete: async () => ({ text: '', provider: 'none' }) },
    now: () => '2026-11-16T00:00:00.000Z',
    newId: () => `h${++n}`,
    llmCallsPerHour: 20,
  });
  actions = new Actions(svc, {
    link: async (id) => `https://site/jira/apps/app/env?handover=${id}`,
    profile: async (accountId) => `https://site/jira/people/${accountId}`,
    findPeople: async (query) =>
      people.filter((p) => p.accountId === query || p.name.toLowerCase().includes(query.toLowerCase())),
  });
  const h = await svc.create(boss, {
    subjectAccountId: 'meera',
    subjectName: 'Meera Iyer',
    reason: 'leaving',
    lastDay: '2026-11-26',
  });
  handoverId = h.id;
  await svc.saveInventory(boss, {
    id: h.id,
    items: [
      item('ari:pay142', { key: 'PAY-142', title: 'Retry backoff', collaborators: ['ari:cloud:identity::user/arjun'] }),
      item('ari:page', { kind: 'confluence_page', title: 'Payment retry runbook', statusCategory: undefined, inboundLinks: 3, updatedAt: '2026-09-01T00:00:00Z' }),
      item('ari:pr', { kind: 'pull_request', title: 'Fix retry jitter', url: 'https://bitbucket.org/nw/pay/pull-requests/7', statusCategory: 'todo', collaborators: ['a', 'b'] }),
    ],
    people: { arjun: 'Arjun Rao' },
  });
});

describe('list-handovers', () => {
  test('lists visible handovers with a link', async () => {
    expect(await actions.listHandovers(boss, {})).toEqual({
      handovers: [
        {
          person: 'Meera Iyer',
          personLink: '[Meera Iyer](https://site/jira/people/meera)',
          reason: 'leaving',
          lastDay: '2026-11-26',
          status: 'draft',
          link: `https://site/jira/apps/app/env?handover=${handoverId}`,
        },
      ],
    });
  });

  test('strangers see none', async () => {
    expect(await actions.listHandovers(stranger, {})).toEqual({ handovers: [] });
  });

  test('an invalid status filter is reported, not thrown', async () => {
    expect(await actions.listHandovers(boss, { status: 'nope' })).toMatchObject({ error: expect.any(String) });
  });
});

describe('get-handover', () => {
  test('finds by first name, full name or account ID', async () => {
    for (const person of ['meera', 'Meera Iyer', 'MEERA']) {
      const r = await actions.getHandover(boss, { person });
      expect(r).toMatchObject({ person: 'Meera Iyer', status: 'draft' });
    }
  });

  test('returns the riskiest items first, with owners by name', async () => {
    await svc.setOwner(boss, { id: handoverId, itemAri: 'ari:pay142', accountId: 'arjun' });
    const r = (await actions.getHandover(boss, { person: 'Meera' })) as any;
    expect(r.topRisks[0]).toMatchObject({ title: 'Payment retry runbook', risk: 70, band: 'high' });
    expect(r.topRisks.find((i: any) => i.key === 'PAY-142')).toMatchObject({ newOwner: 'Arjun Rao' });
  });

  test('the subject and strangers get the same not-found answer', async () => {
    const notFound = { result: 'No handover found for "Meera".' };
    expect(await actions.getHandover(stranger, { person: 'Meera' })).toEqual(notFound);
    expect(await actions.getHandover(meera, { person: 'Meera' })).toEqual(notFound);
  });

  test('a missing person input is an error', async () => {
    expect(await actions.getHandover(boss, {})).toMatchObject({ error: expect.any(String) });
  });
});

describe('people links', () => {
  test('get-handover links the person and each new owner to their Jira profile', async () => {
    await svc.setOwner(boss, { id: handoverId, itemAri: 'ari:pay142', accountId: 'arjun' });
    const r = (await actions.getHandover(boss, { person: 'Meera' })) as any;
    expect(r.personLink).toBe('[Meera Iyer](https://site/jira/people/meera)');
    expect(r.topRisks.find((i: any) => i.key === 'PAY-142').newOwnerLink).toBe('[Arjun Rao](https://site/jira/people/arjun)');
  });

  test('items with no owner get no owner link', async () => {
    const r = (await actions.getHandover(boss, { person: 'Meera' })) as any;
    expect(r.topRisks.find((i: any) => i.title === 'Payment retry runbook').newOwnerLink).toBeNull();
  });

  test('list-at-risk-items and start-handover link people too', async () => {
    const risky = (await actions.listAtRiskItems(boss, { person: 'Meera' })) as any;
    expect(risky.items[0].personLink).toBe('[Meera Iyer](https://site/jira/people/meera)');
    const started = (await actions.startHandover(boss, { person: 'Arjun', reason: 'leave', lastDay: '2027-01-10' })) as any;
    expect(started.personLink).toBe('[Arjun Rao](https://site/jira/people/arjun)');
  });
});

describe('people link text', () => {
  test('square brackets in a name are escaped so the link still works', async () => {
    const { personLink } = await import('../src/actions');
    expect(personLink('Lin [contractor]', 'https://site/jira/people/lin')).toBe('[Lin \\[contractor\\]](https://site/jira/people/lin)');
  });
});

describe('find-owner', () => {
  test.each([
    ['PAY-142', 'Retry backoff'],
    ['pay-142', 'Retry backoff'],
    ['https://bitbucket.org/nw/pay/pull-requests/7', 'Fix retry jitter'],
    ['Payment retry runbook', 'Payment retry runbook'],
    ['retry runbook', 'Payment retry runbook'],
  ])('finds %s', async (query, title) => {
    expect(await actions.findOwner(boss, { item: query })).toMatchObject({ item: { title } });
  });

  test('reports the accepted owner and their reason', async () => {
    await svc.setOwner(boss, { id: handoverId, itemAri: 'ari:pay142', accountId: 'arjun' });
    expect(await actions.findOwner(boss, { item: 'PAY-142' })).toEqual({
      item: { title: 'Retry backoff', key: 'PAY-142', url: 'https://site/ari:pay142' },
      handoverFor: 'Meera Iyer',
      currentOwner: 'Meera Iyer',
      currentOwnerLink: '[Meera Iyer](https://site/jira/people/meera)',
      newOwner: 'Arjun Rao',
      newOwnerLink: '[Arjun Rao](https://site/jira/people/arjun)',
      ownerStatus: 'accepted',
      reason: 'Worked on this item',
      link: `https://site/jira/apps/app/env?handover=${handoverId}`,
    });
  });

  test('falls back to the top suggestion when no owner is accepted', async () => {
    expect(await actions.findOwner(boss, { item: 'PAY-142' })).toMatchObject({
      newOwner: 'Arjun Rao',
      ownerStatus: 'suggested',
    });
  });

  test('items not in a visible handover', async () => {
    expect(await actions.findOwner(boss, { item: 'PAY-999' })).toEqual({ result: 'PAY-999 is not in a handover.' });
    expect(await actions.findOwner(stranger, { item: 'PAY-142' })).toEqual({ result: 'PAY-142 is not in a handover.' });
  });
});

describe('list-at-risk-items', () => {
  test('defaults to High (60+) items', async () => {
    const r = (await actions.listAtRiskItems(boss, { person: 'Meera' })) as any;
    expect(r.items.map((i: any) => i.title)).toEqual(['Payment retry runbook']);
    expect(r.items[0].reasons).toContain('Only Meera Iyer has worked on this');
  });

  test('takes a lower minimum', async () => {
    const r = (await actions.listAtRiskItems(boss, { person: 'Meera', minRisk: '30' })) as any;
    expect(r.items).toHaveLength(2);
  });

  test('without a person, covers every visible handover', async () => {
    const r = (await actions.listAtRiskItems(boss, {})) as any;
    expect(r.items[0]).toMatchObject({ person: 'Meera Iyer' });
  });
});

describe('start-handover', () => {
  test('creates a draft for the matched person and returns a link', async () => {
    const r = await actions.startHandover(boss, { person: 'Arjun', reason: 'leave', lastDay: '2027-01-10' });
    expect(r).toMatchObject({
      result: 'Started a draft handover for Arjun Rao. Open Baton to build the inventory.',
      link: expect.stringContaining('handover=h2'),
    });
    expect((await svc.list(boss)).map((h) => h.subjectName)).toContain('Arjun Rao');
  });

  test('accepts natural reason words', async () => {
    const r = await actions.startHandover(boss, { person: 'Arjun', reason: 'changing teams', lastDay: '2027-01-10' });
    expect(r).toHaveProperty('link');
  });

  test('asks which person when the name is ambiguous', async () => {
    const r = await actions.startHandover(boss, { person: 'r', reason: 'leaving', lastDay: '2027-01-10' });
    expect(r).toEqual({ result: 'More than one person matches "r": Meera Iyer, Arjun Rao. Which one?' });
  });

  test('reports when nobody matches', async () => {
    const r = await actions.startHandover(boss, { person: 'Zed', reason: 'leaving', lastDay: '2027-01-10' });
    expect(r).toEqual({ result: 'Nobody matches "Zed".' });
  });

  test('a bad date is an error', async () => {
    const r = await actions.startHandover(boss, { person: 'Arjun', reason: 'leaving', lastDay: 'Jan 10' });
    expect(r).toMatchObject({ error: expect.stringContaining('lastDay') });
  });
});

describe('compact', () => {
  test('leaves small results alone', () => {
    expect(compact({ a: [1, 2] })).toEqual({ a: [1, 2] });
  });

  test('trims the longest list until the JSON fits, and says so', () => {
    const big = { items: Array.from({ length: 200 }, (_, n) => ({ title: `item ${n} `.repeat(5) })) };
    const out = compact(big, 4096) as any;
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(4096);
    expect(out.items.length).toBeGreaterThan(0);
    expect(out.truncated).toBe(true);
    expect(out.items[0]).toEqual(big.items[0]);
  });
});
