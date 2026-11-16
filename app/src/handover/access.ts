import type { Caller, Handover } from '../types';

/**
 * editor: initiator, recipients and Jira admins (read and edit).
 * subject: the departing person (read and answer their own questions only).
 * null: everyone else. Callers treat this as "not found", so a handover's existence isn't revealed.
 * The subject check wins, so a departing admin can't edit their own handover.
 */
export type Role = 'editor' | 'subject';

export const roleOf = (h: Handover, caller: Caller): Role | null => {
  if (caller.accountId === h.subjectAccountId) return 'subject';
  if (caller.isAdmin || caller.accountId === h.initiatorAccountId || h.recipientAccountIds.includes(caller.accountId)) {
    return 'editor';
  }
  return null;
};

export const subjectView = (h: Handover) => {
  const byAri = new Map(h.items.map((i) => [i.ari, i]));
  return {
    id: h.id,
    role: 'subject' as const,
    subjectName: h.subjectName,
    lastDay: h.lastDay,
    status: h.status,
    questions: h.questions.map((q) => ({
      id: q.id,
      text: q.text,
      answer: q.answer,
      items: q.itemAris.flatMap((a) => {
        const i = byAri.get(a);
        return i ? [{ ari: i.ari, title: i.title, url: i.url }] : [];
      }),
    })),
  };
};

export type SubjectView = ReturnType<typeof subjectView>;
