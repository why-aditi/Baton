import { describe, expect, test } from 'vitest';
import { rankOwners, type OwnerContext } from '../src/scoring/owners';
import type { Item } from '../src/types';

const u = (name: string) => `ari:cloud:identity::user/${name}`;
const MEERA = u('meera');

const item = (over: Partial<Item> = {}): Item => ({
  ari: 'ari:cloud:jira:site:issue/1',
  kind: 'jira_issue',
  title: 'Retry backoff',
  url: 'https://x/browse/PAY-1',
  collaborators: [],
  subjectRole: 'assignee',
  container: 'PAY',
  ...over,
});

const ctx = (over: Partial<OwnerContext> = {}): OwnerContext => ({
  subjectAri: MEERA,
  items: [],
  teams: [],
  openAssigned: {},
  ...over,
});

describe('rankOwners', () => {
  test('no candidates means no suggestions', () => {
    expect(rankOwners(item(), ctx())).toEqual([]);
  });

  test('a collaborator on the item scores 3 and returns a bare account ID', () => {
    expect(rankOwners(item({ collaborators: [u('arjun')] }), ctx())).toEqual([
      { accountId: 'arjun', score: 3, reason: 'Worked on this item' },
    ]);
  });

  test('a PR reviewer counts as a collaborator on the item', () => {
    const pr = item({ kind: 'pull_request', reviewers: [u('lin')] });
    expect(rankOwners(pr, ctx())[0]).toMatchObject({ accountId: 'lin', score: 3 });
  });

  test('the subject is never suggested', () => {
    expect(rankOwners(item({ collaborators: [MEERA] }), ctx())).toEqual([]);
  });

  test('a teammate scores 2 with the team name', () => {
    const teams = [{ name: 'Payments', members: [MEERA, u('arjun')] }];
    expect(rankOwners(item(), ctx({ teams }))).toEqual([
      { accountId: 'arjun', score: 2, reason: 'In Payments' },
    ]);
  });

  test('same-project co-contribution adds 1 per other item, capped at 3', () => {
    const others = [1, 2, 3, 4].map((n) =>
      item({ ari: `ari:cloud:jira:site:issue/${n + 10}`, collaborators: [u('arjun')] }),
    );
    const teams = [{ name: 'Payments', members: [u('arjun')] }];
    const [top] = rankOwners(item(), ctx({ items: others, teams }));
    expect(top).toEqual({ accountId: 'arjun', score: 5, reason: 'In Payments, worked on 4 other items in PAY' });
  });

  test('items in other containers do not count as same project', () => {
    const other = item({ ari: 'ari:other', container: 'PLAT', collaborators: [u('arjun')] });
    const teams = [{ name: 'Payments', members: [u('arjun')] }];
    expect(rankOwners(item(), ctx({ items: [other], teams }))[0]?.score).toBe(2);
  });

  test('the item itself is not counted as a same-project item', () => {
    const it = item({ collaborators: [u('arjun')] });
    expect(rankOwners(it, ctx({ items: [it] }))[0]?.score).toBe(3);
  });

  test('load subtracts 2 x min(open/10, 2)', () => {
    const it = item({ collaborators: [u('arjun')] });
    const [top] = rankOwners(it, ctx({ openAssigned: { [u('arjun')]: 5 } }));
    expect(top).toEqual({ accountId: 'arjun', score: 2, reason: 'Worked on this item (has 5 open items)' });
  });

  test('load is capped at 2', () => {
    const teams = [{ name: 'Payments', members: [u('arjun')] }];
    const it = item({ collaborators: [u('arjun')] });
    expect(rankOwners(it, ctx({ teams, openAssigned: { [u('arjun')]: 40 } }))[0]?.score).toBe(1);
  });

  test('candidates scoring 0 or less are dropped', () => {
    const teams = [{ name: 'Payments', members: [u('arjun')] }];
    expect(rankOwners(item(), ctx({ teams, openAssigned: { [u('arjun')]: 10 } }))).toEqual([]);
  });

  test('returns the top 3 by score, ties broken by account ID', () => {
    const teams = [{ name: 'Payments', members: ['a', 'b', 'c', 'd', 'e'].map(u) }];
    const it = item({ collaborators: [u('e')] });
    expect(rankOwners(it, ctx({ teams })).map((s) => s.accountId)).toEqual(['e', 'a', 'b']);
  });
});
