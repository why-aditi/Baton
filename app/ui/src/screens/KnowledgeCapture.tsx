// The departing person's screen: their questions, each with the items it's about and an answer box
// that saves as they type. Nobody else's view of the handover is shown here.
import Button from '@atlaskit/button/new';
import SectionMessage from '@atlaskit/section-message';
import TextArea from '@atlaskit/textarea';
import { token } from '@atlaskit/tokens';
import { useEffect, useRef, useState } from 'react';
import type { SubjectView } from '../api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState, errorText } from '../components/States';
import { usePlatform } from '../platform';
import { answered } from '../questions';
import { daysUntil, shortDate } from '../view';

const subtle = token('color.text.subtle', '#44546F');
const small = token('font.body.small', '400 12px/16px sans-serif');
const border = `1px solid ${token('color.border', '#091E4224')}`;

/** How long typing has to pause before an answer saves. */
export const AUTOSAVE_MS = 1000;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export const KnowledgeCapture = ({ initial }: { initial: SubjectView }) => {
  const { api, now, openUrl } = usePlatform();
  const [view, setView] = useState(initial);
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.questions.map((q) => [q.id, q.answer ?? ''])),
  );
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<unknown>(null);

  const total = view.questions.length;
  const done = answered(view.questions.map((q) => ({ answer: answers[q.id] })));
  const daysLeft = daysUntil(view.lastDay, now());

  const finish = async () => {
    setConfirmFinish(false);
    setFinishing(true);
    setFinishError(null);
    try {
      setView(await api.finishAnswers(view.id));
    } catch (e) {
      setFinishError(e);
    } finally {
      setFinishing(false);
    }
  };

  if (total === 0) {
    return (
      <EmptyState title="No questions yet">
        Whoever is running your handover hasn’t added questions yet. They’ll show up here.
      </EmptyState>
    );
  }

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '24px 24px 64px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 style={{ margin: 0, font: token('font.heading.large', '600 24px/28px sans-serif') }}>Questions about your work</h1>
        <p style={{ margin: 0, color: subtle }}>
          Your team will rely on these answers after {shortDate(view.lastDay)}
          {daysLeft > 0 ? `, ${daysLeft} days from now` : ''}. Answers save as you type, so you can come back any time.
        </p>
        <div role="status" aria-label="Progress" style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
          <div aria-hidden="true" style={{ flex: 1, maxWidth: 280, height: 6, borderRadius: 3, background: token('color.background.neutral', '#091E420F'), overflow: 'hidden' }}>
            <div style={{ height: 6, width: `${(done / total) * 100}%`, background: token('color.background.success.bold', '#1F845A'), transition: 'width 200ms ease-out' }} />
          </div>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {done} of {total} answered
          </span>
        </div>
      </div>

      {view.status === 'ready' || view.status === 'published' ? (
        <SectionMessage appearance="success" title="Thanks, you’re done">
          <p>Your answers are with your team. You can still change them until the handover is published.</p>
        </SectionMessage>
      ) : null}

      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {view.questions.map((q, i) => (
          <AnswerCard
            key={q.id}
            index={i}
            question={q}
            value={answers[q.id] ?? ''}
            readOnly={view.status === 'published'}
            onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
            save={(v) => api.answerQuestion(view.id, q.id, v)}
            openUrl={openUrl}
          />
        ))}
      </ol>

      {finishError ? (
        <SectionMessage appearance="error" title="That didn’t work">
          <p>{errorText(finishError)}</p>
        </SectionMessage>
      ) : null}

      {view.status === 'collecting' && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Button appearance="primary" isDisabled={finishing} onClick={() => (done < total ? setConfirmFinish(true) : void finish())}>
            {finishing ? 'Sending…' : 'I’m done answering'}
          </Button>
          <span style={{ color: subtle, font: small }}>This tells your manager the answers are ready.</span>
        </div>
      )}

      <ConfirmDialog
        open={confirmFinish}
        title={`${total - done} ${total - done === 1 ? 'question has' : 'questions have'} no answer`}
        confirm="Finish anyway"
        appearance="warning"
        onCancel={() => setConfirmFinish(false)}
        onConfirm={() => void finish()}
      >
        <p>You can still answer them later, but your manager will see the handover as ready now.</p>
      </ConfirmDialog>
    </main>
  );
};

const AnswerCard = ({
  index,
  question: q,
  value,
  readOnly,
  onChange,
  save,
  openUrl,
}: {
  index: number;
  question: SubjectView['questions'][number];
  value: string;
  readOnly: boolean;
  onChange: (v: string) => void;
  save: (v: string) => Promise<unknown>;
  openUrl: (url: string) => void;
}) => {
  const [state, setState] = useState<SaveState>('idle');
  const lastSaved = useRef(q.answer ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(value);
  latest.current = value;

  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const v = latest.current;
    if (v === lastSaved.current) return;
    setState('saving');
    try {
      await save(v);
      lastSaved.current = v;
      // Typing may have continued while this saved; only claim "saved" if it hasn't.
      setState(latest.current === v ? 'saved' : 'idle');
    } catch {
      setState('error');
    }
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onType = (v: string) => {
    onChange(v);
    setState('idle');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
  };

  const id = `answer-${q.id}`;
  return (
    <li style={{ border, borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label htmlFor={id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ font: small, color: subtle }}>Question {index + 1}</span>
        <span style={{ fontWeight: 600 }}>{q.text}</span>
      </label>
      {q.items.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {q.items.map((it) => (
            <a
              key={it.ari}
              href={it.url}
              onClick={(e) => {
                e.preventDefault();
                openUrl(it.url);
              }}
              style={{ font: small, padding: '2px 8px', borderRadius: 3, background: token('color.background.neutral', '#091E420F') }}
            >
              {it.title}
            </a>
          ))}
        </div>
      )}
      <TextArea
        id={id}
        value={value}
        isReadOnly={readOnly}
        minimumRows={3}
        maxHeight="320px"
        placeholder="What would someone taking this over need to know?"
        onChange={(e) => onType(e.currentTarget.value)}
        onBlur={() => void flush()}
      />
      <span aria-live="polite" style={{ font: small, color: state === 'error' ? token('color.text.danger', '#AE2E24') : subtle, minHeight: 16 }}>
        {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'error' ? 'Not saved. Check your connection; it retries when you type or leave the box.' : ''}
      </span>
    </li>
  );
};
