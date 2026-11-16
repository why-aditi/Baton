import { expect, test } from 'vitest';
import { scoreInventory } from '../src/scoring/inventory';
import type { Item } from '../src/types';

const u = (name: string) => `ari:cloud:identity::user/${name}`;

const item = (ari: string, over: Partial<Item> = {}): Item => ({
  ari,
  kind: 'jira_issue',
  title: ari,
  url: `https://x/${ari}`,
  statusCategory: 'todo',
  collaborators: [u('arjun'), u('lin')],
  subjectRole: 'assignee',
  ...over,
});

const ctx = {
  subjectAri: u('meera'),
  subjectName: 'Meera',
  lastDay: '2026-11-26',
  now: '2026-11-16T00:00:00Z',
  teams: [],
  openAssigned: {},
};

test('scores every item, adds suggestions and sorts by risk, highest first', () => {
  const items = [
    item('low'),
    item('high', { collaborators: [], statusCategory: 'in_progress' }),
    item('mid', { collaborators: [u('arjun')], statusCategory: 'in_progress' }),
  ];
  const scored = scoreInventory(items, ctx);
  expect(scored.map((s) => [s.ari, s.risk, s.band])).toEqual([
    ['high', 60, 'high'],
    ['mid', 40, 'medium'],
    ['low', 0, 'low'],
  ]);
  expect(scored[1]?.suggestions[0]).toMatchObject({ accountId: 'arjun' });
});

test('equal risks keep a stable order by title', () => {
  const scored = scoreInventory([item('b'), item('a')], ctx);
  expect(scored.map((s) => s.ari)).toEqual(['a', 'b']);
});

test('duplicate ARIs are merged, keeping the first', () => {
  const scored = scoreInventory([item('a', { title: 'first' }), item('a', { title: 'second' })], ctx);
  expect(scored.map((s) => s.title)).toEqual(['first']);
});
