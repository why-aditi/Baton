import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Handover } from '../../../src/types';
import { ApiError, type Api, type SubjectView } from '../api';
import { handover } from '../fixtures';
import { PlatformProvider, type Platform } from '../platform';
import { isDirty, toDrafts, toSave } from '../questions';
import { EditorHandover } from './EditorHandover';
import { AUTOSAVE_MS, KnowledgeCapture } from './KnowledgeCapture';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const platformWith = (api: Partial<Api>): Platform => ({
  api: api as Api,
  invokeRaw: vi.fn(),
  searchPeople: vi.fn(),
  graph: vi.fn(),
  navigate: vi.fn(),
  openUrl: vi.fn(),
  now: () => new Date('2026-11-23T00:00:00Z'),
});

const renderEditor = (h: Handover, api: Partial<Api> = {}, tab: 'inventory' | 'questions' = 'questions') => {
  const p = platformWith(api);
  render(
    <PlatformProvider value={p}>
      <EditorHandover initial={h} initialTab={tab} />
    </PlatformProvider>,
  );
  return p;
};

describe('question drafts', () => {
  test('saving drops blank drafts, trims text and keeps ids', () => {
    const ds = [...toDrafts(handover().questions), { key: 'new-1', text: '  Where is the PSP key?  ', itemAris: [] }, { key: 'new-2', text: '   ', itemAris: [] }];
    expect(toSave(ds)).toEqual([
      { id: 'q1', text: 'Which decline codes does the backoff skip?', itemAris: ['ari:cloud:jira:site:issue/1'] },
      { text: 'Where is the PSP key?', itemAris: [] },
    ]);
  });

  test('an untouched copy is not dirty; an edit or a blank-only addition behaves as expected', () => {
    const qs = handover().questions;
    expect(isDirty(toDrafts(qs), qs)).toBe(false);
    expect(isDirty([...toDrafts(qs), { key: 'x', text: '', itemAris: [] }], qs)).toBe(false);
    expect(isDirty([{ ...toDrafts(qs)[0]!, text: 'Changed' }], qs)).toBe(true);
  });
});

describe('EditorHandover', () => {
  test('shows the stat line and switches tabs', () => {
    renderEditor(handover(), {}, 'inventory');
    expect(screen.getByText('2 items · 1 high · 1 without an owner · 27 days left')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'See Meera’s answers' }));
    expect(screen.getByRole('tab', { name: /Questions \(0 of 1 answered\)/ }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('QuestionsEditor', () => {
  test('with no questions, Baton drafts them and they appear', async () => {
    const drafted = handover({ status: 'collecting' });
    const generateQuestions = vi.fn().mockResolvedValue(drafted);
    renderEditor(handover({ questions: [] }), { generateQuestions });
    fireEvent.click(screen.getByRole('button', { name: 'Draft questions with Baton' }));
    expect(await screen.findByDisplayValue('Which decline codes does the backoff skip?')).toBeTruthy();
    expect(generateQuestions).toHaveBeenCalledWith('h1');
  });

  test('when the LLM is down, it says so and writing your own still works', async () => {
    const generateQuestions = vi.fn().mockRejectedValue(new ApiError('llm_unavailable', 'Could not generate questions.'));
    renderEditor(handover({ questions: [] }), { generateQuestions });
    fireEvent.click(screen.getByRole('button', { name: 'Draft questions with Baton' }));
    expect(await screen.findByText('Baton couldn’t draft questions right now')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Write my own' }));
    expect(screen.getByLabelText('Question 1')).toBeTruthy();
  });

  test('editing and saving sends the questions with their ids', async () => {
    const saveQuestions = vi.fn().mockImplementation(async (_id, qs) => handover({ status: 'collecting', questions: qs.map((q: any, i: number) => ({ id: q.id ?? `q${i + 1}`, text: q.text, itemAris: q.itemAris })) }));
    renderEditor(handover({ status: 'collecting' }), { saveQuestions });
    const save = screen.getByRole('button', { name: 'Save questions' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Question 1'), { target: { value: 'Which decline codes are skipped, and why?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add a question' }));
    fireEvent.change(screen.getByLabelText('Question 2'), { target: { value: 'Who at the partner bank do we call?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save questions' }));
    await waitFor(() =>
      expect(saveQuestions).toHaveBeenCalledWith('h1', [
        { id: 'q1', text: 'Which decline codes are skipped, and why?', itemAris: ['ari:cloud:jira:site:issue/1'] },
        { text: 'Who at the partner bank do we call?', itemAris: [] },
      ]),
    );
    expect(await screen.findByText('Questions saved. Meera sees this version now.')).toBeTruthy();
  });

  test('removing an answered question asks first', () => {
    const h = handover({ status: 'collecting' });
    h.questions[0]!.answer = 'Hard declines, on purpose.';
    renderEditor(h);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByText('Remove an answered question?')).toBeTruthy();
  });

  test('a ready handover says the answers are in', () => {
    renderEditor(handover({ status: 'ready' }));
    expect(screen.getByText('Meera has finished answering')).toBeTruthy();
  });
});

const subjectView = (over: Partial<SubjectView> = {}): SubjectView => ({
  id: 'h1',
  role: 'subject',
  subjectName: 'Meera Iyer',
  lastDay: '2026-12-20',
  status: 'collecting',
  questions: [
    { id: 'q1', text: 'Which decline codes does the backoff skip?', answer: undefined, items: [{ ari: 'a1', title: 'PAY-1 backoff', url: 'https://x/PAY-1' }] },
    { id: 'q2', text: 'Where is the replay tool’s plan?', answer: 'In the DLQ design page.', items: [] },
  ],
  ...over,
});

const renderCapture = (api: Partial<Api>, view = subjectView()) => {
  const p = platformWith(api);
  render(
    <PlatformProvider value={p}>
      <KnowledgeCapture initial={view} />
    </PlatformProvider>,
  );
  return p;
};

describe('KnowledgeCapture', () => {
  test('answers save after a pause in typing', async () => {
    vi.useFakeTimers();
    const answerQuestion = vi.fn().mockResolvedValue(subjectView());
    renderCapture({ answerQuestion });
    expect(screen.getByText('1 of 2 answered')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Which decline codes/), { target: { value: 'Hard declines' } });
    expect(screen.getByText('2 of 2 answered')).toBeTruthy();
    expect(answerQuestion).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_MS);
    });
    expect(answerQuestion).toHaveBeenCalledWith('h1', 'q1', 'Hard declines');
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  test('leaving the box saves straight away, and an unchanged answer isn’t resent', async () => {
    const answerQuestion = vi.fn().mockResolvedValue(subjectView());
    renderCapture({ answerQuestion });
    const box = screen.getByLabelText(/replay tool/);
    fireEvent.blur(box);
    expect(answerQuestion).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: 'In the DLQ design page, section 3.' } });
    fireEvent.blur(box);
    await waitFor(() => expect(answerQuestion).toHaveBeenCalledWith('h1', 'q2', 'In the DLQ design page, section 3.'));
  });

  test('a failed save says so', async () => {
    renderCapture({ answerQuestion: vi.fn().mockRejectedValue(new Error('offline')) });
    const box = screen.getByLabelText(/Which decline codes/);
    fireEvent.change(box, { target: { value: 'x' } });
    fireEvent.blur(box);
    expect(await screen.findByText(/Not saved/)).toBeTruthy();
  });

  test('finishing with unanswered questions asks first, then marks it done', async () => {
    const finishAnswers = vi.fn().mockResolvedValue(subjectView({ status: 'ready' }));
    renderCapture({ finishAnswers });
    fireEvent.click(screen.getByRole('button', { name: 'I’m done answering' }));
    expect(screen.getByText('1 question has no answer')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Finish anyway' }));
    expect(await screen.findByText('Thanks, you’re done')).toBeTruthy();
    expect(finishAnswers).toHaveBeenCalledWith('h1');
  });

  test('item links open outside the iframe', () => {
    const p = renderCapture({});
    fireEvent.click(screen.getByRole('link', { name: 'PAY-1 backoff' }));
    expect(p.openUrl).toHaveBeenCalledWith('https://x/PAY-1');
  });
});
