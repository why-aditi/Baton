import { describe, expect, test } from 'vitest';
import { validateOutput } from '../src/llm/validate';

const known = new Set(['a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
const q = (id: string, itemAris: string[]) => ({ id, text: `Where is ${id} documented?`, itemAris });
const questions = (list: ReturnType<typeof q>[]) => JSON.stringify({ questions: list });
const five = ['a1', 'a2', 'a3', 'a4', 'a5'].map((a, n) => q(`q${n}`, [a]));

describe('validateOutput: questions', () => {
  test('accepts 5 well-formed, grounded questions', () => {
    const r = validateOutput('questions', questions(five), known);
    expect(r).toEqual({ ok: true, value: { questions: five }, unknownAris: [] });
  });

  test('rejects text that is not JSON', () => {
    const r = validateOutput('questions', 'Sure! Here are some questions', known);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('not valid JSON') });
  });

  test('rejects fewer than 5 questions', () => {
    const r = validateOutput('questions', questions(five.slice(0, 4)), known);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('questions') });
  });

  test('rejects more than 10 questions', () => {
    const many = Array.from({ length: 11 }, (_, n) => q(`q${n}`, ['a1']));
    expect(validateOutput('questions', questions(many), known).ok).toBe(false);
  });

  test('rejects a question with no linked items', () => {
    expect(validateOutput('questions', questions([...five.slice(0, 4), q('q9', [])]), known).ok).toBe(false);
  });

  test('strips an unknown ARI when 20% or fewer are unknown', () => {
    const list = [q('q0', ['a1', 'zz']), ...five.slice(1)]; // 1 unknown of 6 references
    const r = validateOutput('questions', questions(list), known);
    expect(r).toMatchObject({ ok: true, unknownAris: ['zz'] });
    expect(r.ok && r.value.questions[0]?.itemAris).toEqual(['a1']);
  });

  test('drops a question whose only ARIs were unknown', () => {
    const list = [...five, q('q5', ['a6']), q('q6', ['a1']), q('q7', ['a2']), q('q8', ['a3']), q('q9', ['zz'])];
    const r = validateOutput('questions', questions(list), known); // 1 of 10 unknown
    expect(r.ok && r.value.questions.map((x) => x.id)).not.toContain('q9');
  });

  test('fails when more than 20% of ARIs are unknown, naming them', () => {
    const list = [q('q0', ['x1']), q('q1', ['x2']), ...five.slice(2)]; // 2 of 5 unknown
    const r = validateOutput('questions', questions(list), known);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('x1, x2') });
  });

  test('fails when stripping leaves fewer than 5 questions', () => {
    const list = [...five.slice(0, 4), q('q4', ['zz'])]; // 1 of 5 unknown = 20%, but only 4 remain
    expect(validateOutput('questions', questions(list), known).ok).toBe(false);
  });

  test('accepts JSON wrapped in a markdown code fence', () => {
    expect(validateOutput('questions', '```json\n' + questions(five) + '\n```', known).ok).toBe(true);
  });
});

describe('validateOutput: itemSummaries', () => {
  test('drops entries for unknown items', () => {
    const raw = JSON.stringify({
      items: [
        { ari: 'a1', oneLine: 'Retry job' },
        { ari: 'a2', oneLine: 'Runbook' },
        { ari: 'a3', oneLine: 'PR' },
        { ari: 'a4', oneLine: 'Page' },
        { ari: 'zz', oneLine: 'Invented' },
      ],
    });
    const r = validateOutput('itemSummaries', raw, known);
    expect(r).toMatchObject({ ok: true, unknownAris: ['zz'] });
    expect(r.ok && r.value.items.map((i) => i.ari)).toEqual(['a1', 'a2', 'a3', 'a4']);
  });
});

describe('validateOutput: summary', () => {
  const summary = (itemAris: string[]) =>
    JSON.stringify({
      overview: 'P1 is leaving.',
      risks: ['Retry job has no other owner'],
      sections: [{ ownerAri: 'P2', body: 'Take the retry job.', itemAris }],
    });

  test('accepts a grounded summary', () => {
    expect(validateOutput('summary', summary(['a1', 'a2']), known).ok).toBe(true);
  });

  test('rejects a summary missing the overview', () => {
    expect(validateOutput('summary', JSON.stringify({ risks: [], sections: [] }), known).ok).toBe(false);
  });

  test('fails on mostly invented item ARIs', () => {
    expect(validateOutput('summary', summary(['zz', 'yy', 'a1']), known).ok).toBe(false);
  });
});
