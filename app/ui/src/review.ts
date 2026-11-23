// What the Review and publish tab needs from a handover: what's ready, what can be reassigned, and
// an editable copy of the summary.
import type { Handover, HandoverSummary, ScoredItem } from '../../src/types';
import { answered } from './questions';

/** Jira issues with a confirmed new owner: the only ones reassignIssues accepts. */
export const reassignable = (h: Handover): ScoredItem[] =>
  h.items.filter((i) => i.kind === 'jira_issue' && !!i.key && !!i.acceptedOwnerAccountId);

export type Readiness = {
  hasSummary: boolean;
  answered: number;
  questions: number;
  confirmedOwners: number;
  items: number;
  /** High-risk items nobody has confirmed an owner for. */
  highWithoutOwner: ScoredItem[];
};

export const readiness = (h: Handover): Readiness => ({
  hasSummary: !!h.summary,
  answered: answered(h.questions),
  questions: h.questions.length,
  confirmedOwners: h.items.filter((i) => i.acceptedOwnerAccountId).length,
  items: h.items.length,
  highWithoutOwner: h.items.filter((i) => i.band === 'high' && !i.acceptedOwnerAccountId),
});

/** The summary as the editor holds it: risks as one block of text, one risk per line. */
export type SummaryDraft = { overview: string; risks: string; sections: HandoverSummary['sections'] };

export const EMPTY_SUMMARY: HandoverSummary = { overview: '', risks: [], sections: [] };

export const toSummaryDraft = (s: HandoverSummary): SummaryDraft => ({
  overview: s.overview,
  risks: s.risks.join('\n'),
  sections: s.sections.map((x) => ({ ...x, itemAris: [...x.itemAris] })),
});

export const fromSummaryDraft = (d: SummaryDraft): HandoverSummary => ({
  overview: d.overview.trim(),
  risks: d.risks
    .split('\n')
    .map((r) => r.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean),
  sections: d.sections.map((x) => ({ ...x, body: x.body.trim() })),
});

export const summaryDirty = (d: SummaryDraft, saved: HandoverSummary | undefined): boolean =>
  JSON.stringify(fromSummaryDraft(d)) !== JSON.stringify(fromSummaryDraft(toSummaryDraft(saved ?? EMPTY_SUMMARY)));

/** "Meera Iyer → Arjun Rao" when she's the assignee; otherwise only the new owner, since Baton doesn't know who has it now. */
export const changeLabel = (item: ScoredItem, subjectName: string, ownerName: string): string =>
  item.subjectRole === 'assignee' ? `${subjectName} → ${ownerName}` : `New assignee: ${ownerName}`;
