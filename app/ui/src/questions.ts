// The question editor's working copy and checks. Drafts carry a local key so new, unsaved questions
// can be edited and removed before they have a server id.
import type { Question } from '../../src/types';

export type Draft = { key: string; id?: string; text: string; itemAris: string[]; answer?: string };

export const MAX_QUESTION = 1000;

let seq = 0;
export const newKey = () => `new-${++seq}`;

export const toDrafts = (qs: Question[]): Draft[] =>
  qs.map((q) => ({ key: q.id, id: q.id, text: q.text, itemAris: [...q.itemAris], ...(q.answer && { answer: q.answer }) }));

/** What saveQuestions takes: empty questions are dropped, ids kept so answers stay attached. */
export const toSave = (ds: Draft[]) =>
  ds
    .filter((d) => d.text.trim())
    .map((d) => ({ ...(d.id && { id: d.id }), text: d.text.trim(), itemAris: d.itemAris }));

export const isDirty = (ds: Draft[], saved: Question[]): boolean =>
  JSON.stringify(toSave(ds)) !== JSON.stringify(toSave(toDrafts(saved)));

/** Per-draft problems, keyed by draft key. Blank drafts are fine; they're dropped on save. */
export const draftErrors = (ds: Draft[]): Record<string, string> =>
  Object.fromEntries(
    ds.filter((d) => d.text.trim().length > MAX_QUESTION).map((d) => [d.key, `Keep questions under ${MAX_QUESTION} characters.`]),
  );

export const answered = (qs: { answer?: string }[]) => qs.filter((q) => q.answer?.trim()).length;
