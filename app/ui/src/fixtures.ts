// Test data: a slice of the Northwind Pay story (scripts/seed/story.ts).
import type { Handover, ScoredItem } from '../../src/types';

export const item = (over: Partial<ScoredItem> = {}): ScoredItem => ({
  ari: 'ari:cloud:jira:site:issue/1',
  kind: 'jira_issue',
  key: 'PAY-1',
  title: 'Payment retry: exponential backoff for card declines',
  url: 'https://northwind.atlassian.net/browse/PAY-1',
  status: 'In progress',
  statusCategory: 'in_progress',
  dueDate: '2026-12-23',
  collaborators: [],
  subjectRole: 'assignee',
  risk: 75,
  band: 'high',
  reasons: ['Only Meera Iyer has worked on this', 'Work is mid-flight', 'Due soon after they leave'],
  suggestions: [
    { accountId: 'arjun', score: 7, reason: 'Same team, worked on 3 related items (has 6 open items)' },
    { accountId: 'lin', score: 4, reason: 'Same team (has 5 open items)' },
  ],
  ...over,
});

export const handover = (over: Partial<Handover> = {}): Handover => ({
  id: 'h1',
  subjectAccountId: 'meera',
  subjectAri: 'ari:cloud:identity::user/meera',
  subjectName: 'Meera Iyer',
  initiatorAccountId: 'priya',
  recipientAccountIds: [],
  reason: 'leaving',
  lastDay: '2026-12-20',
  status: 'draft',
  items: [
    item(),
    item({
      ari: 'ari:cloud:confluence:site:page/9',
      kind: 'confluence_page',
      key: undefined,
      title: 'Payment retry service runbook',
      url: 'https://northwind.atlassian.net/wiki/x',
      status: undefined,
      dueDate: undefined,
      risk: 55,
      band: 'medium',
      reasons: ['Only Meera Iyer has worked on this', 'Widely referenced page'],
      suggestions: [],
    }),
  ],
  people: { meera: 'Meera Iyer', arjun: 'Arjun Rao', lin: 'Lin Chen', dana: 'Dana Weiss' },
  questions: [{ id: 'q1', text: 'Which decline codes does the backoff skip?', itemAris: ['ari:cloud:jira:site:issue/1'] }],
  inputHash: 'x',
  generatedFrom: {},
  createdAt: '2026-11-20T00:00:00Z',
  updatedAt: '2026-11-20T00:00:00Z',
  ...over,
});
