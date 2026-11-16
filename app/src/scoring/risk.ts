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

/** Deterministic 0–100 knowledge-risk score. Every point added carries a reason for the UI. */
export const scoreRisk = (item: Item, ctx: RiskContext): RiskResult => {
  let risk = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => {
    risk += points;
    reasons.push(reason);
  };

  const open = item.statusCategory !== 'done';
  const others = new Set(item.collaborators.filter((c) => c !== ctx.subjectAri));

  if (others.size === 0) add(40, `Only ${ctx.subjectName} has worked on this`);
  else if (others.size === 1) add(20, 'Only one other person has context');

  if (item.statusCategory === 'in_progress') add(20, 'Work is mid-flight');

  const reviewers = item.reviewers ?? [];
  if (
    item.kind === 'pull_request' &&
    item.statusCategory === 'in_progress' &&
    reviewers.length > 0 &&
    reviewers.every((r) => r === ctx.subjectAri)
  ) {
    add(15, 'No other reviewer');
  }

  if (open && item.updatedAt && Date.parse(ctx.now) - Date.parse(item.updatedAt) > STALE_DAYS * DAY) {
    add(10, 'Stale, so context is likely only in their head');
  }

  if (item.kind === 'confluence_page' && (item.inboundLinks ?? 0) >= WIDELY_REFERENCED) {
    add(15, 'Widely referenced page');
  }

  const deadline = Date.parse(ctx.lastDay) + DUE_GRACE_DAYS * DAY;
  const dates = [item.dueDate, item.sprintEndDate].filter((d): d is string => !!d);
  if (open && dates.some((d) => Date.parse(d) <= deadline)) add(15, 'Due soon after they leave');

  risk = Math.min(100, risk);
  return { risk, band: bandFor(risk), reasons };
};
