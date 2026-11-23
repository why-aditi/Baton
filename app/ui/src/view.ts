// Pure helpers the screens use to turn a Handover into what they show. Tested in view.test.ts.
import { reasonPoints } from '../../src/scoring/risk';
import type { Band, Handover, ItemKind, ScoredItem } from '../../src/types';

const DAY = 24 * 60 * 60 * 1000;

export const SOURCE_LABEL: Record<ItemKind, string> = {
  jira_issue: 'Jira',
  pull_request: 'Bitbucket',
  confluence_page: 'Confluence',
  goal: 'Goals',
  project: 'Projects',
};

export const BAND_LABEL: Record<Band, string> = { high: 'High risk', medium: 'Medium risk', low: 'Low risk' };

/** Whole days from `now` until the last day (a YYYY-MM-DD date), never below 0. */
export const daysUntil = (lastDay: string, now: Date): number => {
  const end = Date.parse(`${lastDay}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((end - today) / DAY));
};

/** "Dec 20" style, for dates stored as YYYY-MM-DD or full ISO strings. */
export const shortDate = (iso: string): string =>
  new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

export const ownerOf = (item: ScoredItem): string | undefined => item.acceptedOwnerAccountId ?? item.suggestions[0]?.accountId;

export const personName = (h: Handover, accountId: string | null | undefined): string =>
  (accountId && h.people[accountId]) || 'Unknown person';

export const firstName = (name: string): string => name.split(/\s+/)[0] || name;

export type Stats = { items: number; high: number; withoutOwner: number; daysLeft: number };

export const statsFor = (h: Handover, now: Date): Stats => ({
  items: h.items.length,
  high: h.items.filter((i) => i.band === 'high').length,
  withoutOwner: h.items.filter((i) => !ownerOf(i)).length,
  daysLeft: daysUntil(h.lastDay, now),
});

/** "Jira · PAY-1" or just "Confluence" when there is no key. */
export const sourceLine = (item: ScoredItem): string =>
  [SOURCE_LABEL[item.kind], item.key].filter(Boolean).join(' · ');

/** The item's status and due date, e.g. "In progress · due Dec 23". */
export const statusLine = (item: ScoredItem): string =>
  [item.status, item.dueDate && `due ${shortDate(item.dueDate)}`].filter(Boolean).join(' · ');

export type BreakdownRow = { reason: string; points: number };

/** Each reason with the points it added. Sums to the item's risk unless the score was capped at 100. */
export const breakdown = (item: ScoredItem): BreakdownRow[] => item.reasons.map((reason) => ({ reason, points: reasonPoints(reason) }));

/** Questions that mention this item. */
export const questionsFor = (h: Handover, ari: string) => h.questions.filter((q) => q.itemAris.includes(ari));

/** People Baton knows about, sorted by name, for the "someone else" picker. The subject is left out. */
export const pickablePeople = (h: Handover): { accountId: string; name: string }[] =>
  Object.entries(h.people)
    .filter(([id]) => id !== h.subjectAccountId)
    .map(([accountId, name]) => ({ accountId, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
