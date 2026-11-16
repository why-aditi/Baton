import type { Handover, ScoredItem } from '../src/types';

export const scored = (ari: string, over: Partial<ScoredItem> = {}): ScoredItem => ({
  ari,
  kind: 'jira_issue',
  title: ari,
  url: `https://x/${ari}`,
  collaborators: [],
  subjectRole: 'assignee',
  risk: 0,
  band: 'low',
  reasons: [],
  suggestions: [],
  ...over,
});

export const makeHandover = (over: Partial<Handover> = {}): Handover => ({
  id: 'h1',
  subjectAccountId: 'meera',
  subjectAri: 'ari:cloud:identity::user/meera',
  subjectName: 'Meera',
  initiatorAccountId: 'boss',
  recipientAccountIds: [],
  reason: 'leaving',
  lastDay: '2026-11-26',
  status: 'draft',
  items: [scored('i1', { title: 'Payment retry runbook', risk: 80, band: 'high' })],
  people: { meera: 'Meera', boss: 'Boss' },
  questions: [],
  inputHash: '',
  generatedFrom: {},
  createdAt: '2026-11-16T00:00:00.000Z',
  updatedAt: '2026-11-16T00:00:00.000Z',
  ...over,
});
