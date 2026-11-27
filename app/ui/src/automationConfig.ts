// The Jira Automation settings form for the start-handover action: what it reads from Automation and
// what it submits back. Automation's contract for Forge action config isn't documented anywhere we
// could reach, so saved values are read from whichever of the likely fields is present, and the
// submitted object uses the action's own input names (manifest.yml: person, reason, lastDay, recipient).
import type { Reason } from '../../src/types';

export type AutomationValues = { person: string; reason: Reason | ''; lastDay: string; recipient: string };
export type AutomationErrors = Partial<Record<keyof AutomationValues, string>>;

const SAVED_FIELDS = ['config', 'inputs', 'actionConfig'] as const;

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export const initialValues = (extension: unknown): AutomationValues => {
  const ext = (extension ?? {}) as Record<string, unknown>;
  const saved = (SAVED_FIELDS.map((k) => ext[k]).find((v) => v && typeof v === 'object') ?? {}) as Record<string, unknown>;
  return {
    person: str(saved.person),
    reason: (str(saved.reason) || 'leaving') as Reason,
    lastDay: str(saved.lastDay),
    recipient: str(saved.recipient),
  };
};

export const validate = (v: AutomationValues): AutomationErrors => {
  const e: AutomationErrors = {};
  if (!v.person.trim()) e.person = 'Who is leaving? A name, an account ID or a smart value.';
  if (!v.reason) e.reason = 'Pick a reason.';
  if (!v.lastDay.trim()) e.lastDay = 'Their last day, as YYYY-MM-DD or a smart value such as {{issue.duedate}}.';
  return e;
};

export const toSubmit = (v: AutomationValues): Record<string, string> => ({
  person: v.person.trim(),
  reason: v.reason,
  lastDay: v.lastDay.trim(),
  ...(v.recipient.trim() && { recipient: v.recipient.trim() }),
});
