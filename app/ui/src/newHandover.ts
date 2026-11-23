// The New handover form's values and checks, kept out of the component so they're easy to test.
import type { Reason } from '../../src/types';

export type Person = { accountId: string; name: string };

export type NewHandoverValues = {
  person: Person | null;
  reason: Reason;
  lastDay: string;
  recipient: Person | null;
};

export type FieldErrors = Partial<Record<'person' | 'lastDay' | 'recipient', string>>;

export const REASONS: { value: Reason; label: string; lastDayLabel: string }[] = [
  { value: 'leaving', label: 'Leaving the company', lastDayLabel: 'Last day' },
  { value: 'leave', label: 'Going on leave', lastDayLabel: 'Last day before leave' },
  { value: 'team_change', label: 'Changing teams', lastDayLabel: 'Last day on the team' },
];

/** YYYY-MM-DD for the given moment, in UTC (the backend compares dates the same way). */
export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

export const validate = (v: NewHandoverValues, today: string): FieldErrors => {
  const e: FieldErrors = {};
  if (!v.person) e.person = 'Choose the person whose work is being handed over.';
  if (!v.lastDay) e.lastDay = 'Choose their last day.';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(v.lastDay)) e.lastDay = 'Enter the date as YYYY-MM-DD.';
  else if (v.lastDay < today) e.lastDay = 'Their last day can’t be in the past.';
  if (v.recipient && v.person && v.recipient.accountId === v.person.accountId) {
    e.recipient = 'Pick someone other than the person leaving.';
  }
  return e;
};

export const toPayload = (v: NewHandoverValues) => ({
  subjectAccountId: v.person!.accountId,
  subjectName: v.person!.name,
  reason: v.reason,
  lastDay: v.lastDay,
  recipientAccountIds: v.recipient ? [v.recipient.accountId] : [],
});
