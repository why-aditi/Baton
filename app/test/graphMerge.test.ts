import { describe, expect, test } from 'vitest';
import { coverageWarnings, mergeItems } from '../src/graph/merge';
import type { Item } from '../src/types';

const item = (over: Partial<Item> = {}): Item => ({
  ari: 'a',
  kind: 'jira_issue',
  title: 'Retry',
  url: 'https://x/a',
  collaborators: [],
  subjectRole: 'reporter',
  ...over,
});

describe('mergeItems', () => {
  test('keeps distinct items in first-seen order', () => {
    expect(mergeItems([[item({ ari: 'a' })], [item({ ari: 'b' })]]).map((i) => i.ari)).toEqual(['a', 'b']);
  });

  test('an item from two sources keeps the strongest role', () => {
    const merged = mergeItems([[item({ subjectRole: 'reporter' })], [item({ subjectRole: 'assignee' })]]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.subjectRole).toBe('assignee');
  });

  test('authoring a PR beats reviewing it', () => {
    const merged = mergeItems([[item({ subjectRole: 'reviewer' })], [item({ subjectRole: 'author' })]]);
    expect(merged[0]?.subjectRole).toBe('author');
  });

  test('collaborators and reviewers are unioned', () => {
    const merged = mergeItems([
      [item({ collaborators: ['u1'], reviewers: ['r1'] })],
      [item({ collaborators: ['u1', 'u2'], reviewers: ['r2'] })],
    ]);
    expect(merged[0]).toMatchObject({ collaborators: ['u1', 'u2'], reviewers: ['r1', 'r2'] });
  });

  test('missing fields are filled from the other copy, without overwriting', () => {
    const merged = mergeItems([[item({ status: 'In Progress' })], [item({ status: 'Done', dueDate: '2026-12-01' })]]);
    expect(merged[0]).toMatchObject({ status: 'In Progress', dueDate: '2026-12-01' });
  });
});

describe('coverageWarnings', () => {
  const ok = { source: 'assignedJira', label: 'Jira work items', count: 3, dropped: 0, errors: [], truncated: false };

  test('no warnings when every source returned data', () => {
    expect(coverageWarnings([ok])).toEqual([]);
  });

  test('an empty source with no errors points at scopes', () => {
    expect(coverageWarnings([{ ...ok, count: 0, hint: 'read:graph:issue:jira' }])).toEqual([
      {
        source: 'assignedJira',
        level: 'info',
        message: 'No Jira work items found. If you expected some, check that the read:graph:issue:jira scope is granted.',
      },
    ]);
  });

  test('errors are reported', () => {
    expect(coverageWarnings([{ ...ok, errors: ['FORBIDDEN'] }])).toEqual([
      { source: 'assignedJira', level: 'error', message: 'Could not load all Jira work items (FORBIDDEN).' },
    ]);
  });

  test('hidden rows are reported', () => {
    expect(coverageWarnings([{ ...ok, dropped: 2 }])[0]).toMatchObject({
      level: 'warning',
      message: "2 Jira work items are hidden because you can't see them. Someone with more access should run this handover.",
    });
  });

  test('truncation is reported', () => {
    expect(coverageWarnings([{ ...ok, truncated: true }])[0]).toMatchObject({
      level: 'warning',
      message: 'Only the first 3 Jira work items were loaded.',
    });
  });
});
