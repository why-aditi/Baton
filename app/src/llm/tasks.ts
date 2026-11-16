// The three LLM calls. Each one pseudonymizes people, refers to items by short refs (I1, I2…)
// instead of ARIs, validates and grounds the output, and maps everything back afterwards.
import type { Handover, HandoverSummary, Question, ScoredItem } from '../types';
import { completeValidated, type Client, type Message } from './client';
import { Pseudonymizer } from './pseudonymize';

const MAX_QUESTION_ITEMS = 15;
const MAX_SUMMARY_ITEMS = 60;
const ONE_LINE_BATCH = 10;
const MAX_TEXT = 500;

const GROUNDING =
  'Use only the items provided. Never invent item refs, people, issue keys or dates. ' +
  'People appear as placeholders like P1; keep them exactly as given. Reply with one JSON object only.';

const cut = (s: string, n = MAX_TEXT) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const pseudonymizerFor = (h: Handover) =>
  new Pseudonymizer([
    { ari: h.subjectAccountId, name: h.subjectName },
    ...Object.entries(h.people)
      .filter(([id]) => id !== h.subjectAccountId)
      .map(([ari, name]) => ({ ari, name })),
  ]);

const byRisk = (items: ScoredItem[]) => [...items].sort((a, b) => b.risk - a.risk);

/** Assigns I1, I2… refs and returns the item payloads plus the ref→ARI map. */
const refItems = (items: ScoredItem[], p: Pseudonymizer, subjectAri: string, start = 1) => {
  const refToAri = new Map<string, string>();
  const payload = items.map((i, n) => {
    const ref = `I${start + n}`;
    refToAri.set(ref, i.ari);
    return {
      ref,
      kind: i.kind,
      key: i.key,
      title: p.scrub(cut(i.title, 200)),
      status: i.status,
      risk: i.risk,
      reasons: i.reasons.map((r) => p.scrub(r)),
      otherCollaborators: new Set(i.collaborators.filter((c) => c !== subjectAri)).size,
    };
  });
  return { payload, refToAri };
};

const messages = (system: string, user: unknown): Message[] => [
  { role: 'system', content: `${system} ${GROUNDING}` },
  { role: 'user', content: JSON.stringify(user) },
];

export const generateQuestions = async (llm: Client, h: Handover): Promise<Question[] | null> => {
  const items = byRisk(h.items).slice(0, MAX_QUESTION_ITEMS);
  if (items.length === 0) return null;
  const p = pseudonymizerFor(h);
  const { payload, refToAri } = refItems(items, p, h.subjectAri);
  const subject = p.alias(h.subjectAccountId);

  const out = await completeValidated(llm, {
    task: 'questions',
    tier: 'large',
    known: new Set(refToAri.keys()),
    messages: messages(
      `${subject} is leaving their team. Write 5 to 10 questions for ${subject} that capture knowledge only ` +
        `they have about the riskiest items below. Each question must be concrete and answerable by ${subject} ` +
        `(for example "Where are the staging credentials for the payments retry job documented?"), never generic ` +
        `("Any tips?"). Link every question to the refs of the items it is about. ` +
        `Schema: {"questions":[{"id":string,"text":string,"itemAris":[ref]}]}.`,
      { person: subject, reason: h.reason, lastDay: h.lastDay, items: payload },
    ),
  });
  return (
    out?.questions.map((q, n) => ({
      id: `q${n + 1}`,
      text: p.restore(q.text),
      itemAris: q.itemAris.map((r) => refToAri.get(r)!),
    })) ?? null
  );
};

/** One-liners for High and Medium items, keyed by ARI. Failed batches are skipped. */
export const summarizeItems = async (llm: Client, h: Handover): Promise<Record<string, string>> => {
  const items = byRisk(h.items).filter((i) => i.band !== 'low');
  const p = pseudonymizerFor(h);
  const lines: Record<string, string> = {};

  for (let start = 0; start < items.length; start += ONE_LINE_BATCH) {
    const { payload, refToAri } = refItems(items.slice(start, start + ONE_LINE_BATCH), p, h.subjectAri, start + 1);
    const out = await completeValidated(llm, {
      task: 'itemSummaries',
      tier: 'fast',
      known: new Set(refToAri.keys()),
      messages: messages(
        'For each item, write one plain sentence (under 15 words) saying what it is and why it matters in a handover. ' +
          'Schema: {"items":[{"ari":ref,"oneLine":string}]}.',
        { items: payload },
      ),
    });
    for (const i of out?.items ?? []) lines[refToAri.get(i.ari)!] = p.restore(i.oneLine);
  }
  return lines;
};

export const generateSummary = async (llm: Client, h: Handover): Promise<HandoverSummary | null> => {
  const items = byRisk(h.items).slice(0, MAX_SUMMARY_ITEMS);
  if (items.length === 0) return null;
  const p = pseudonymizerFor(h);
  const { payload, refToAri } = refItems(items, p, h.subjectAri);
  const withOwners = payload.map((pl, n) => {
    const owner = items[n]!.acceptedOwnerAccountId ?? items[n]!.suggestions[0]?.accountId;
    return { ...pl, owner: owner ? p.alias(owner) : null };
  });
  const refByAri = new Map([...refToAri].map(([ref, ari]) => [ari, ref]));
  const answers = h.questions
    .filter((q) => q.answer?.trim())
    .map((q) => ({
      question: p.scrub(q.text),
      answer: p.scrub(cut(q.answer!)),
      items: q.itemAris.map((a) => refByAri.get(a)).filter(Boolean),
    }));
  const subject = p.alias(h.subjectAccountId);

  const out = await completeValidated(llm, {
    task: 'summary',
    tier: 'large',
    known: new Set(refToAri.keys()),
    messages: messages(
      `Write the handover document for ${subject}'s work. overview: 2 to 4 sentences. risks: the most important ` +
        `risks, one sentence each. sections: one per new owner (ownerAri is that owner's placeholder), saying what ` +
        `they take over and folding in ${subject}'s answers where relevant. ` +
        `Schema: {"overview":string,"risks":[string],"sections":[{"ownerAri":placeholder,"body":string,"itemAris":[ref]}]}.`,
      { person: subject, reason: h.reason, lastDay: h.lastDay, items: withOwners, answers },
    ),
  });
  if (!out) return null;
  return {
    overview: p.restore(out.overview),
    risks: out.risks.map((r) => p.restore(r)),
    sections: out.sections.map((s) => ({
      ownerAccountId: p.restoreAri(s.ownerAri),
      body: p.restore(s.body),
      itemAris: s.itemAris.map((r) => refToAri.get(r)!),
    })),
  };
};
