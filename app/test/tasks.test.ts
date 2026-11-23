import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Client, Message } from '../src/llm/client';
import { generateQuestions, generateSummary, summarizeItems } from '../src/llm/tasks';
import { makeHandover, scored } from './helpers';

/** A fake LLM that records prompts and replies with whatever the test hands it (one reply per call). */
const fakeLlm = (...replies: (string | ((msgs: Message[]) => string))[]) => {
  const prompts: Message[][] = [];
  const client: Client = {
    async complete({ messages }) {
      prompts.push(messages);
      const r = replies.shift();
      if (r === undefined) throw new Error('down');
      return { text: typeof r === 'function' ? r(messages) : r, provider: 'fake' };
    },
  };
  return { client, prompts, sent: () => JSON.stringify(prompts) };
};

const handover = makeHandover({
  subjectName: 'Meera Iyer',
  people: { meera: 'Meera Iyer', arjun: 'Arjun Rao', boss: 'Boss' },
  items: [
    scored('ari:i1', {
      title: "Meera's payment retry runbook",
      key: 'PAY-1',
      risk: 80,
      band: 'high',
      reasons: ['Only Meera Iyer has worked on this'],
      suggestions: [{ accountId: 'arjun', score: 3, reason: 'Worked on this item' }],
      acceptedOwnerAccountId: 'arjun',
    }),
    scored('ari:i2', { title: 'Retry PR', risk: 40, band: 'medium', collaborators: ['ari:cloud:identity::user/arjun'] }),
    scored('ari:i3', { title: 'Old page', risk: 10, band: 'low' }),
  ],
});

const qs = (refs: string[]) =>
  JSON.stringify({ questions: refs.map((r, n) => ({ id: `q${n}`, text: `Where is ${r} documented?`, itemAris: [r] })) });

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('generateQuestions', () => {
  test('sends no names or account IDs, and maps item refs back to ARIs', async () => {
    const llm = fakeLlm(qs(['I1', 'I1', 'I2', 'I2', 'I1']));
    const questions = await generateQuestions(llm.client, handover);
    expect(llm.sent()).not.toMatch(/Meera|Arjun|arjun|ari:/);
    expect(llm.sent()).toContain('P1');
    expect(questions?.map((q) => q.itemAris)).toEqual([['ari:i1'], ['ari:i1'], ['ari:i2'], ['ari:i2'], ['ari:i1']]);
  });

  test('restores names in the question text', async () => {
    const llm = fakeLlm(
      JSON.stringify({
        questions: Array.from({ length: 5 }, (_, n) => ({ id: `q${n}`, text: 'P1, who else knows?', itemAris: ['I1'] })),
      }),
    );
    expect((await generateQuestions(llm.client, handover))?.[0]?.text).toBe('Meera Iyer, who else knows?');
  });

  test('turns item refs the model wrote into the text into item names (seen live with Groq, Nov 23)', async () => {
    const texts = ['Where are the test cases for PAY-7 (I1) stored?', 'Who reviews I2 and API2 now?', 'Steps for (I1, I2)?', 'Backoff (PAY-1, I1) first.'];
    const llm = fakeLlm(
      JSON.stringify({
        questions: [...texts, 'Q4?', 'Q5?'].map((text, n) => ({ id: `q${n}`, text, itemAris: ['I1'] })),
      }),
    );
    // I2 is the second-riskiest item in the fixture handover.
    const second = handover.items[1]!;
    expect((await generateQuestions(llm.client, handover))?.slice(0, 4).map((q) => q.text)).toEqual([
      'Where are the test cases for PAY-7 stored?',
      `Who reviews ${second.key ?? second.title} and API2 now?`,
      'Steps for?',
      // I1 is PAY-1, so the replaced ref would repeat the key.
      'Backoff (PAY-1) first.',
    ]);
  });

  test('sends at most the top 15 items by risk', async () => {
    const many = makeHandover({
      items: Array.from({ length: 20 }, (_, n) => scored(`ari:${n}`, { risk: n, title: `T${n}` })),
    });
    const llm = fakeLlm(qs(['I1', 'I2', 'I3', 'I4', 'I5']));
    await generateQuestions(llm.client, many);
    expect(llm.sent()).toContain('T19');
    expect(llm.sent()).toContain('T5');
    expect(llm.sent()).not.toContain('"T4"');
  });

  test('returns null when the LLM is down', async () => {
    expect(await generateQuestions(fakeLlm().client, handover)).toBeNull();
  });

  test('returns null with no items, without calling the LLM', async () => {
    const llm = fakeLlm();
    expect(await generateQuestions(llm.client, makeHandover({ items: [] }))).toBeNull();
    expect(llm.prompts).toHaveLength(0);
  });
});

describe('summarizeItems', () => {
  test('summarizes only High and Medium items, keyed by ARI', async () => {
    const llm = fakeLlm(
      JSON.stringify({
        items: [
          { ari: 'I1', oneLine: "P1's runbook for retries" },
          { ari: 'I2', oneLine: 'Open retry PR' },
        ],
      }),
    );
    const lines = await summarizeItems(llm.client, handover);
    expect(lines).toEqual({ 'ari:i1': "Meera Iyer's runbook for retries", 'ari:i2': 'Open retry PR' });
    expect(llm.sent()).not.toContain('Old page');
  });

  test('batches 10 items per call', async () => {
    const many = makeHandover({
      items: Array.from({ length: 12 }, (_, n) => scored(`ari:${n}`, { risk: 50, band: 'medium' })),
    });
    const reply = (msgs: Message[]) => {
      const refs = [...msgs.at(-1)!.content.matchAll(/"ref":"(I\d+)"/g)].map((m) => m[1]);
      return JSON.stringify({ items: refs.map((ari) => ({ ari, oneLine: 'x' })) });
    };
    const llm = fakeLlm(reply, reply);
    expect(Object.keys((await summarizeItems(llm.client, many)) ?? {})).toHaveLength(12);
    expect(llm.prompts).toHaveLength(2);
  });

  test('a failed batch is skipped, the rest still return', async () => {
    const many = makeHandover({
      items: Array.from({ length: 12 }, (_, n) => scored(`ari:${n}`, { risk: 50, band: 'medium' })),
    });
    const llm = fakeLlm('nope', 'nope', JSON.stringify({ items: [{ ari: 'I11', oneLine: 'x' }] }));
    expect(Object.keys((await summarizeItems(llm.client, many)) ?? {})).toHaveLength(1);
  });
});

describe('generateSummary', () => {
  const withAnswers = { ...handover, questions: [{ id: 'q1', text: 'Where?', itemAris: ['ari:i1'], answer: 'Arjun has the keys' }] };

  test('maps owner placeholders and item refs back, and anonymizes answers', async () => {
    const llm = fakeLlm((msgs) => {
      const user = msgs.at(-1)!.content;
      const arjun = user.match(/"owner":"(P\d+)"/)![1];
      return JSON.stringify({
        overview: 'P1 is leaving on 2026-11-26.',
        risks: ['Runbook only known by P1'],
        sections: [{ ownerAri: arjun, body: `${arjun} takes the runbook.`, itemAris: ['I1'] }],
      });
    });
    const summary = await generateSummary(llm.client, withAnswers);
    expect(llm.sent()).not.toMatch(/Meera|Arjun|arjun/);
    expect(summary).toEqual({
      overview: 'Meera Iyer is leaving on 2026-11-26.',
      risks: ['Runbook only known by Meera Iyer'],
      sections: [{ ownerAccountId: 'arjun', body: 'Arjun Rao takes the runbook.', itemAris: ['ari:i1'] }],
    });
  });

  test('a section with an unknown owner placeholder keeps its body but has no owner', async () => {
    const llm = fakeLlm(
      JSON.stringify({ overview: 'o', risks: [], sections: [{ ownerAri: 'P99', body: 'b', itemAris: ['I1'] }] }),
    );
    expect((await generateSummary(llm.client, withAnswers))?.sections[0]?.ownerAccountId).toBeNull();
  });
});
