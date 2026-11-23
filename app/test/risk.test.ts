import { describe, expect, test } from 'vitest';
import { reasonPoints, scoreRisk, type RiskContext } from '../src/scoring/risk';
import type { Item } from '../src/types';

const MEERA = 'ari:cloud:identity::user/meera';
const ARJUN = 'ari:cloud:identity::user/arjun';
const LIN = 'ari:cloud:identity::user/lin';

const ctx: RiskContext = {
  subjectAri: MEERA,
  subjectName: 'Meera',
  lastDay: '2026-11-26',
  now: '2026-11-16T00:00:00Z',
};

// A baseline item that triggers no signal: two other collaborators, to do, fresh, no dates.
const item = (over: Partial<Item> = {}): Item => ({
  ari: 'ari:cloud:jira:site:issue/1',
  kind: 'jira_issue',
  title: 'Retry backoff',
  url: 'https://x/browse/PAY-1',
  statusCategory: 'todo',
  updatedAt: '2026-11-15T00:00:00Z',
  collaborators: [ARJUN, LIN],
  subjectRole: 'assignee',
  ...over,
});

describe('scoreRisk', () => {
  test('an item with no signals scores 0, low band, no reasons', () => {
    expect(scoreRisk(item(), ctx)).toEqual({ risk: 0, band: 'low', reasons: [] });
  });

  test('no collaborators other than the subject adds 40 with their name', () => {
    const r = scoreRisk(item({ collaborators: [MEERA] }), ctx);
    expect(r.risk).toBe(40);
    expect(r.reasons).toEqual(['Only Meera has worked on this']);
  });

  test('exactly one other collaborator adds 20', () => {
    const r = scoreRisk(item({ collaborators: [MEERA, ARJUN] }), ctx);
    expect(r.risk).toBe(20);
    expect(r.reasons).toEqual(['Only one other person has context']);
  });

  test('duplicate collaborator ARIs count once', () => {
    expect(scoreRisk(item({ collaborators: [ARJUN, ARJUN] }), ctx).risk).toBe(20);
  });

  test('in-progress work adds 20', () => {
    const r = scoreRisk(item({ statusCategory: 'in_progress' }), ctx);
    expect(r.risk).toBe(20);
    expect(r.reasons).toEqual(['Work is mid-flight']);
  });

  test('subject as the only reviewer on an open PR adds 15', () => {
    const pr = item({ kind: 'pull_request', statusCategory: 'in_progress', reviewers: [MEERA] });
    const r = scoreRisk(pr, ctx);
    expect(r.risk).toBe(35);
    expect(r.reasons).toContain('No other reviewer');
  });

  test('another reviewer on the PR means no reviewer signal', () => {
    const pr = item({ kind: 'pull_request', statusCategory: 'in_progress', reviewers: [MEERA, ARJUN] });
    expect(scoreRisk(pr, ctx).reasons).not.toContain('No other reviewer');
  });

  test('a closed PR gets no reviewer signal', () => {
    const pr = item({ kind: 'pull_request', statusCategory: 'done', reviewers: [MEERA] });
    expect(scoreRisk(pr, ctx).reasons).not.toContain('No other reviewer');
  });

  test('open and not updated for over 30 days adds 10', () => {
    const r = scoreRisk(item({ updatedAt: '2026-10-01T00:00:00Z' }), ctx);
    expect(r.risk).toBe(10);
    expect(r.reasons).toEqual(['Stale, so context is likely only in their head']);
  });

  test('updated exactly 30 days ago is not stale', () => {
    expect(scoreRisk(item({ updatedAt: '2026-10-17T00:00:00Z' }), ctx).risk).toBe(0);
  });

  test('done items are never stale', () => {
    expect(scoreRisk(item({ statusCategory: 'done', updatedAt: '2026-01-01T00:00:00Z' }), ctx).risk).toBe(0);
  });

  test('a page linked from 3 or more other pages adds 15', () => {
    const page = item({ kind: 'confluence_page', statusCategory: undefined, inboundLinks: 3 });
    const r = scoreRisk(page, ctx);
    expect(r.risk).toBe(15);
    expect(r.reasons).toEqual(['Widely referenced page']);
  });

  test('a page linked from 2 pages gets no reference signal', () => {
    const page = item({ kind: 'confluence_page', statusCategory: undefined, inboundLinks: 2 });
    expect(scoreRisk(page, ctx).risk).toBe(0);
  });

  test('due within 7 days after the last day adds 15', () => {
    const r = scoreRisk(item({ dueDate: '2026-12-03' }), ctx);
    expect(r.risk).toBe(15);
    expect(r.reasons).toEqual(['Due soon after they leave']);
  });

  test('due before the last day also counts', () => {
    expect(scoreRisk(item({ dueDate: '2026-11-20' }), ctx).risk).toBe(15);
  });

  test('due 8 days after the last day does not count', () => {
    expect(scoreRisk(item({ dueDate: '2026-12-04' }), ctx).risk).toBe(0);
  });

  test('a sprint ending soon counts like a due date', () => {
    expect(scoreRisk(item({ sprintEndDate: '2026-11-30' }), ctx).risk).toBe(15);
  });

  test('done items are never due soon', () => {
    expect(scoreRisk(item({ statusCategory: 'done', dueDate: '2026-11-20' }), ctx).risk).toBe(0);
  });

  test('the score is clamped to 100', () => {
    const worst = item({
      kind: 'pull_request',
      collaborators: [],
      statusCategory: 'in_progress',
      reviewers: [MEERA],
      updatedAt: '2026-09-01T00:00:00Z',
      dueDate: '2026-11-20',
    });
    expect(scoreRisk(worst, ctx).risk).toBe(100);
  });

  test.each([
    [60, 'high'],
    [59, 'medium'],
    [30, 'medium'],
    [29, 'low'],
  ] as const)('a score of %i is %s', async (score, band) => {
    const { bandFor } = await import('../src/scoring/risk');
    expect(bandFor(score)).toBe(band);
  });

  test('the hero item: Meera-only, mid-flight runbook work is high risk', () => {
    const r = scoreRisk(item({ collaborators: [], statusCategory: 'in_progress' }), ctx);
    expect(r).toMatchObject({ risk: 60, band: 'high' });
  });
});

describe('reasonPoints', () => {
  // Each combination fires different signals; the breakdown must add up to the score every time.
  const cases: Partial<Item>[] = [
    { collaborators: [MEERA], statusCategory: 'in_progress', dueDate: '2026-11-28' },
    { collaborators: [ARJUN], updatedAt: '2026-09-01T00:00:00Z' },
    { kind: 'pull_request', statusCategory: 'in_progress', collaborators: [ARJUN, LIN], reviewers: [MEERA] },
    { kind: 'confluence_page', collaborators: [MEERA], inboundLinks: 4 },
  ];
  test.each(cases)('reasons add up to the score: %o', (over) => {
    const r = scoreRisk(item(over), ctx);
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.reasons.reduce((n, x) => n + reasonPoints(x), 0)).toBe(r.risk);
  });

  test('an unknown reason is worth 0', () => {
    expect(reasonPoints('Something else')).toBe(0);
  });
});
