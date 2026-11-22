import { describe, expect, test } from 'vitest';
import { ISSUES, PAGES, PULL_REQUESTS, PROJECTS, USERS, dueDate } from '../seed/story';

const users = new Set(Object.keys(USERS));

describe('Northwind Pay story (spec: Seed data and demo environment)', () => {
  test('7 users, Meera among them', () => {
    expect(users.size).toBe(7);
    expect(USERS.meera.name).toBe('Meera Iyer');
  });

  test('about 60 issues across the 2 projects, with unique seed IDs', () => {
    expect(ISSUES.length).toBeGreaterThanOrEqual(55);
    expect(ISSUES.length).toBeLessThanOrEqual(65);
    expect(new Set(ISSUES.map((i) => i.project))).toEqual(new Set(Object.keys(PROJECTS)));
    expect(new Set(ISSUES.map((i) => i.id)).size).toBe(ISSUES.length);
  });

  test('14 open issues assigned to Meera: some mid-flight, some due soon after her last day', () => {
    const hers = ISSUES.filter((i) => i.assignee === 'meera');
    expect(hers).toHaveLength(14);
    expect(hers.every((i) => i.status !== 'done')).toBe(true);
    expect(hers.filter((i) => i.status === 'in_progress').length).toBeGreaterThanOrEqual(4);
    expect(hers.filter((i) => i.due !== undefined && i.due <= 7).length).toBeGreaterThanOrEqual(3);
  });

  test('some of her issues have nobody else on them (the "Only Meera" chip)', () => {
    const solo = ISSUES.filter((i) => i.assignee === 'meera' && i.reporter === 'meera' && i.comments.every((c) => c.by === 'meera'));
    expect(solo.length).toBeGreaterThanOrEqual(4);
  });

  test('the hero issue is Meera-only and mid-flight', () => {
    const hero = ISSUES.find((i) => i.id === 'pay-retry-backoff')!;
    expect(hero).toMatchObject({ assignee: 'meera', reporter: 'meera', status: 'in_progress', comments: [] });
  });

  test('everyone named is a seed user', () => {
    for (const i of ISSUES) {
      expect(users.has(i.reporter)).toBe(true);
      if (i.assignee) expect(users.has(i.assignee)).toBe(true);
      for (const c of i.comments) expect(users.has(c.by)).toBe(true);
    }
    for (const p of PAGES) for (const u of [p.author, ...p.editors]) expect(users.has(u)).toBe(true);
    for (const pr of PULL_REQUESTS) for (const u of [pr.author, ...pr.reviewers]) expect(users.has(u)).toBe(true);
  });

  test('about 12 pages, 4 only Meera has touched', () => {
    expect(PAGES.length).toBeGreaterThanOrEqual(11);
    expect(PAGES.length).toBeLessThanOrEqual(13);
    expect(PAGES.filter((p) => p.author === 'meera' && p.editors.length === 0)).toHaveLength(4);
    expect(new Set(PAGES.map((p) => p.title)).size).toBe(PAGES.length);
  });

  test('the payment-retry runbook is Meera-only and linked from 3 or more other pages', () => {
    const runbook = PAGES.find((p) => p.id === 'runbook')!;
    expect(runbook).toMatchObject({ author: 'meera', editors: [] });
    expect(PAGES.filter((p) => p.links.includes('runbook')).length).toBeGreaterThanOrEqual(3);
  });

  test('page links point at seed pages', () => {
    const ids = new Set(PAGES.map((p) => p.id));
    for (const p of PAGES) for (const l of p.links) expect(ids.has(l)).toBe(true);
  });

  test('6 PRs: 2 by Meera with no other reviewer, 1 she reviews for someone else', () => {
    expect(PULL_REQUESTS).toHaveLength(6);
    expect(PULL_REQUESTS.filter((p) => p.author === 'meera' && p.reviewers.length === 0)).toHaveLength(2);
    expect(PULL_REQUESTS.filter((p) => p.author !== 'meera' && p.reviewers.includes('meera'))).toHaveLength(1);
    expect(new Set(PULL_REQUESTS.map((p) => p.branch)).size).toBe(6);
  });

  test('PRs that name an issue name a seed issue', () => {
    const ids = new Set(ISSUES.map((i) => i.id));
    for (const pr of PULL_REQUESTS) if (pr.issue) expect(ids.has(pr.issue)).toBe(true);
  });

  test('due dates are relative to Meera\'s last day', () => {
    expect(dueDate('2026-12-30', 3)).toBe('2027-01-02');
    expect(dueDate('2026-12-30', -2)).toBe('2026-12-28');
  });
});
