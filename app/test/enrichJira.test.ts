import { describe, expect, test } from 'vitest';
import { applyIssueDetails, issueDetails, issueIdOf, sprintFieldId } from '../src/enrich/jira';
import type { Item } from '../src/types';

const ARI = 'ari:cloud:jira:cloud-1:issue/66400';

describe('issueIdOf', () => {
  test('takes the issue ID from a Jira ARI', () => {
    expect(issueIdOf(ARI)).toBe('66400');
  });
  test('returns undefined for other ARIs', () => {
    expect(issueIdOf('ari:cloud:confluence:c:page/1')).toBeUndefined();
  });
});

describe('sprintFieldId', () => {
  test('finds the Sprint custom field by its schema, not its name', () => {
    const fields = [
      { id: 'summary', name: 'Summary', schema: { type: 'string' } },
      { id: 'customfield_10020', name: 'Sprint', schema: { type: 'array', custom: 'com.pyxis.greenhopper.jira:gh-sprint' } },
    ];
    expect(sprintFieldId(fields)).toBe('customfield_10020');
  });
  test('is undefined on sites without Jira Software sprints', () => {
    expect(sprintFieldId([{ id: 'summary', schema: { type: 'string' } }])).toBeUndefined();
    expect(sprintFieldId(null)).toBeUndefined();
  });
});

describe('issueDetails', () => {
  const search = (fields: Record<string, unknown>) => ({ issues: [{ id: '66400', key: 'SALES-31', fields }] });

  test('reads the updated date', () => {
    expect(issueDetails(search({ updated: '2026-10-01T10:00:00.000+0000' }), undefined)).toEqual({
      '66400': { updatedAt: '2026-10-01T10:00:00.000Z' },
    });
  });

  test('uses the active sprint end date', () => {
    const sprints = [
      { state: 'closed', endDate: '2026-11-01T00:00:00.000Z' },
      { state: 'active', endDate: '2026-11-28T00:00:00.000Z' },
      { state: 'future', endDate: '2026-12-12T00:00:00.000Z' },
    ];
    expect(issueDetails(search({ customfield_10020: sprints }), 'customfield_10020')['66400']).toEqual({
      sprintEndDate: '2026-11-28',
    });
  });

  test('falls back to the earliest future sprint, and ignores closed ones', () => {
    const future = [
      { state: 'future', endDate: '2026-12-26T00:00:00.000Z' },
      { state: 'future', endDate: '2026-12-12T00:00:00.000Z' },
    ];
    expect(issueDetails(search({ customfield_10020: future }), 'customfield_10020')['66400']?.sprintEndDate).toBe('2026-12-12');
    const closed = [{ state: 'closed', endDate: '2026-11-01T00:00:00.000Z' }];
    expect(issueDetails(search({ customfield_10020: closed }), 'customfield_10020')['66400']).toEqual({});
  });

  test('tolerates missing and malformed fields', () => {
    expect(issueDetails({ issues: [{ id: '1', fields: { updated: 'not a date', customfield_10020: 'x' } }, null] }, 'customfield_10020')).toEqual({
      '1': {},
    });
    expect(issueDetails(null, undefined)).toEqual({});
  });
});

describe('applyIssueDetails', () => {
  const item = (over: Partial<Item> = {}): Item => ({
    ari: ARI,
    kind: 'jira_issue',
    title: 't',
    url: 'u',
    collaborators: [],
    subjectRole: 'assignee',
    ...over,
  });

  test('fills only fields the graph left empty', () => {
    const [out] = applyIssueDetails([item({ sprintEndDate: '2026-12-01' })], {
      '66400': { updatedAt: '2026-10-01T00:00:00.000Z', sprintEndDate: '2026-11-28' },
    });
    expect(out).toMatchObject({ updatedAt: '2026-10-01T00:00:00.000Z', sprintEndDate: '2026-12-01' });
  });

  test('leaves non-Jira items and unknown issues alone', () => {
    const page = item({ ari: 'ari:cloud:confluence:c:page/1', kind: 'confluence_page' });
    const other = item({ ari: 'ari:cloud:jira:c:issue/999' });
    expect(applyIssueDetails([page, other], { '66400': { updatedAt: 'x' } })).toEqual([page, other]);
  });
});
