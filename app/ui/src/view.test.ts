import { describe, expect, test } from 'vitest';
import { handover, item } from './fixtures';
import { parseRoute, pathFor } from './route';
import { breakdown, daysUntil, ownerOf, pickablePeople, questionsFor, shortDate, sourceLine, statsFor, statusLine } from './view';

describe('view helpers', () => {
  test('daysUntil counts whole days and never goes below 0', () => {
    expect(daysUntil('2026-12-20', new Date('2026-11-23T15:00:00Z'))).toBe(27);
    expect(daysUntil('2026-12-20', new Date('2026-12-25T00:00:00Z'))).toBe(0);
  });

  test('shortDate reads both date-only and full ISO strings', () => {
    expect(shortDate('2026-12-20')).toBe('Dec 20');
    expect(shortDate('2026-12-20T23:00:00Z')).toBe('Dec 20');
  });

  test('stats count high items and items with neither a confirmed nor a suggested owner', () => {
    expect(statsFor(handover(), new Date('2026-11-23T00:00:00Z'))).toEqual({ items: 2, high: 1, withoutOwner: 1, daysLeft: 27 });
  });

  test('the confirmed owner wins over the top suggestion', () => {
    expect(ownerOf(item())).toBe('arjun');
    expect(ownerOf(item({ acceptedOwnerAccountId: 'dana' }))).toBe('dana');
    expect(ownerOf(item({ suggestions: [] }))).toBeUndefined();
  });

  test('source and status lines skip missing parts', () => {
    expect(sourceLine(item())).toBe('Jira · PAY-1');
    expect(sourceLine(item({ kind: 'confluence_page', key: undefined }))).toBe('Confluence');
    expect(statusLine(item())).toBe('In progress · due Dec 23');
    expect(statusLine(item({ status: undefined, dueDate: undefined }))).toBe('');
  });

  test('the breakdown adds up to the risk score', () => {
    const rows = breakdown(item());
    expect(rows.map((r) => r.points)).toEqual([40, 20, 15]);
    expect(rows.reduce((n, r) => n + r.points, 0)).toBe(75);
  });

  test('questions are matched to items by ARI', () => {
    const h = handover();
    expect(questionsFor(h, 'ari:cloud:jira:site:issue/1')).toHaveLength(1);
    expect(questionsFor(h, 'ari:cloud:confluence:site:page/9')).toHaveLength(0);
  });

  test('the person leaving is not offered as an owner', () => {
    expect(pickablePeople(handover()).map((p) => p.name)).toEqual(['Arjun Rao', 'Dana Weiss', 'Lin Chen']);
  });
});

describe('routes', () => {
  test.each([
    ['/', { name: 'list' }],
    ['', { name: 'list' }],
    ['/handover/abc-123', { name: 'handover', id: 'abc-123' }],
    ['/handover/abc-123/', { name: 'handover', id: 'abc-123' }],
    ['/dev', { name: 'dev' }],
    ['/new', { name: 'new' }],
    ['/something/else', { name: 'list' }],
  ])('%s', (path, route) => {
    expect(parseRoute(path)).toEqual(route);
  });

  test('pathFor round-trips, including the build flag', () => {
    expect(parseRoute(pathFor({ name: 'handover', id: 'a b' }))).toEqual({ name: 'handover', id: 'a b' });
    const [path, search] = pathFor({ name: 'handover', id: 'h1', build: true }).split('?');
    expect(parseRoute(path!, `?${search}`)).toEqual({ name: 'handover', id: 'h1', build: true });
  });
});
