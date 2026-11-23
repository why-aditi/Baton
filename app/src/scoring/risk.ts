import type { Band, Item } from '../types';

export type RiskContext = {
  subjectAri: string;
  /** Display name used in reason strings, e.g. "Only Meera has worked on this". */
  subjectName: string;
  /** ISO date of the departing person's last day. */
  lastDay: string;
  /** Injected so scoring is deterministic in tests. */
  now: string;
};

export type RiskResult = { risk: number; band: Band; reasons: string[] };

const DAY = 24 * 60 * 60 * 1000;
const STALE_DAYS = 30;
const DUE_GRACE_DAYS = 7;
const WIDELY_REFERENCED = 3;

export const bandFor = (risk: number): Band => (risk >= 60 ? 'high' : risk >= 30 ? 'medium' : 'low');

/** Points per signal. Every reason string scoreRisk emits maps to one of these (see reasonPoints). */
const POINTS = {
  onlySubject: 40,
  oneOther: 20,
  midFlight: 20,
  noOtherReviewer: 15,
  stale: 10,
  // 20, not 15 (tuned on the seed, Nov 23): pages can't be mid-flight or due soon, so at 15 a page only
  // the subject knows that others depend on (40 + 15) stayed Medium. At 20 it reaches High (60).
  widelyReferenced: 20,
  dueSoon: 15,
} as const;

const FIXED_REASONS: Record<string, number> = {
  'Only one other person has context': POINTS.oneOther,
  'Work is mid-flight': POINTS.midFlight,
  'No other reviewer': POINTS.noOtherReviewer,
  'Stale, so context is likely only in their head': POINTS.stale,
  'Widely referenced page': POINTS.widelyReferenced,
  'Due soon after they leave': POINTS.dueSoon,
};

/** How many points a stored reason added, for the UI's score breakdown. Unknown reasons give 0. */
export const reasonPoints = (reason: string): number =>
  FIXED_REASONS[reason] ?? (/^Only .+ has worked on this$/.test(reason) ? POINTS.onlySubject : 0);

/** Deterministic 0–100 knowledge-risk score. Every point added carries a reason for the UI. */
export const scoreRisk = (item: Item, ctx: RiskContext): RiskResult => {
  let risk = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => {
    risk += points;
    reasons.push(reason);
  };

  const open = item.statusCategory !== 'done';
  // People Baton can't name (Bitbucket PR authors) still have context.
  const others = new Set(item.collaborators.filter((c) => c !== ctx.subjectAri)).size + (item.unnamedOthers ?? 0);

  if (others === 0) add(POINTS.onlySubject, `Only ${ctx.subjectName} has worked on this`);
  else if (others === 1) add(POINTS.oneOther, 'Only one other person has context');

  if (item.statusCategory === 'in_progress') add(POINTS.midFlight, 'Work is mid-flight');

  const reviewers = item.reviewers ?? [];
  if (
    item.kind === 'pull_request' &&
    item.statusCategory === 'in_progress' &&
    reviewers.length > 0 &&
    reviewers.every((r) => r === ctx.subjectAri)
  ) {
    add(POINTS.noOtherReviewer, 'No other reviewer');
  }

  if (open && item.updatedAt && Date.parse(ctx.now) - Date.parse(item.updatedAt) > STALE_DAYS * DAY) {
    add(POINTS.stale, 'Stale, so context is likely only in their head');
  }

  if (item.kind === 'confluence_page' && (item.inboundLinks ?? 0) >= WIDELY_REFERENCED) {
    add(POINTS.widelyReferenced, 'Widely referenced page');
  }

  const deadline = Date.parse(ctx.lastDay) + DUE_GRACE_DAYS * DAY;
  const dates = [item.dueDate, item.sprintEndDate].filter((d): d is string => !!d);
  if (open && dates.some((d) => Date.parse(d) <= deadline)) add(POINTS.dueSoon, 'Due soon after they leave');

  risk = Math.min(100, risk);
  return { risk, band: bandFor(risk), reasons };
};
