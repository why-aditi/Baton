// The manager's side of knowledge capture: draft questions with Baton or by hand, link each to the
// items it's about, and watch the answers come in.
import Button from '@atlaskit/button/new';
import Select from '@atlaskit/select';
import SectionMessage from '@atlaskit/section-message';
import TextArea from '@atlaskit/textarea';
import { token } from '@atlaskit/tokens';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Handover } from '../../../src/types';
import { ApiError } from '../api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState, errorText } from '../components/States';
import { usePlatform } from '../platform';
import { answered, draftErrors, isDirty, newKey, toDrafts, toSave, type Draft } from '../questions';
import { firstName, sourceLine } from '../view';

const subtle = token('color.text.subtle', '#44546F');
const small = token('font.body.small', '400 12px/16px sans-serif');
const border = `1px solid ${token('color.border', '#091E4224')}`;

type Option = { label: string; value: string };
type Pending = 'draft' | 'redraft' | 'save' | 'refresh' | null;

export const QuestionsEditor = ({
  handover: h,
  onChange,
  onShowInventory,
}: {
  handover: Handover;
  onChange: (h: Handover) => void;
  onShowInventory: () => void;
}) => {
  const { api } = usePlatform();
  const [drafts, setDrafts] = useState<Draft[]>(() => toDrafts(h.questions));
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<unknown>(null);
  const [confirm, setConfirm] = useState<null | { kind: 'redraft' } | { kind: 'remove'; key: string }>(null);
  const [saved, setSaved] = useState(false);
  const name = firstName(h.subjectName);
  const readOnly = h.status === 'published';
  const dirty = isDirty(drafts, h.questions);
  const errors = draftErrors(drafts);

  // Answers arrive on the server copy; take it whenever there are no local edits to lose.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!dirtyRef.current) setDrafts(toDrafts(h.questions));
  }, [h.questions]);

  const itemOptions = useMemo<Option[]>(
    () => h.items.map((i) => ({ value: i.ari, label: `${i.title} (${sourceLine(i)})` })),
    [h.items],
  );

  const run = async (kind: Exclude<Pending, null>, fn: () => Promise<Handover>) => {
    setPending(kind);
    setError(null);
    setSaved(false);
    try {
      const next = await fn();
      setDrafts(toDrafts(next.questions));
      onChange(next);
      if (kind === 'save') setSaved(true);
    } catch (e) {
      setError(e);
    } finally {
      setPending(null);
    }
  };

  const update = (key: string, patch: Partial<Draft>) => {
    setSaved(false);
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };
  const remove = (key: string) => setDrafts((ds) => ds.filter((d) => d.key !== key));
  const add = () => setDrafts((ds) => [...ds, { key: newKey(), text: '', itemAris: [] }]);

  const busy = pending !== null;

  if (drafts.length === 0) {
    return (
      <div style={{ padding: '0 24px' }}>
        <EmptyState
          title={`Ask ${name} what isn’t written down`}
          action={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
              {error ? <ErrorNote error={error} name={name} /> : null}
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  appearance="primary"
                  isDisabled={busy || h.items.length === 0 || readOnly}
                  onClick={() => void run('draft', () => api.generateQuestions(h.id))}
                >
                  {pending === 'draft' ? 'Drafting…' : 'Draft questions with Baton'}
                </Button>
                <Button isDisabled={busy || readOnly} onClick={add}>
                  Write my own
                </Button>
              </div>
            </div>
          }
        >
          {h.items.length === 0 ? (
            <>
              Baton drafts questions from {name}’s riskiest items, so{' '}
              <a
                href="#inventory"
                onClick={(e) => {
                  e.preventDefault();
                  onShowInventory();
                }}
              >
                build the inventory
              </a>{' '}
              first, or write your own.
            </>
          ) : (
            <>
              Baton drafts 5 to 10 questions about {name}’s riskiest items, each linked to the work it’s about. {name} can see them as
              soon as they’re drafted or saved, so review them right after.
            </>
          )}
        </EmptyState>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 24px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <StatusNote handover={h} name={name} onRefresh={() => void run('refresh', () => api.getHandover(h.id).then((v) => (v.role === 'editor' ? v.handover : h)))} refreshing={pending === 'refresh'} disabled={busy || dirty} />

      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {drafts.map((d, i) => {
          const textId = `q-${d.key}`;
          const err = errors[d.key];
          return (
            <li key={d.key} style={{ border, borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <label htmlFor={textId} style={{ fontWeight: 600 }}>
                  Question {i + 1}
                </label>
                {!readOnly && (
                  <Button
                    appearance="subtle"
                    isDisabled={busy}
                    onClick={() => (d.answer?.trim() ? setConfirm({ kind: 'remove', key: d.key }) : remove(d.key))}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <TextArea
                id={textId}
                value={d.text}
                isReadOnly={readOnly}
                isInvalid={!!err}
                minimumRows={2}
                maxHeight="200px"
                placeholder={`What should ${name} explain before leaving?`}
                onChange={(e) => update(d.key, { text: e.currentTarget.value })}
              />
              {err && (
                <span role="alert" style={{ color: token('color.text.danger', '#AE2E24'), font: small }}>
                  {err}
                </span>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label htmlFor={`items-${d.key}`} style={{ font: small, color: subtle }}>
                  About these items
                </label>
                <Select<Option, true>
                  inputId={`items-${d.key}`}
                  isMulti
                  isDisabled={readOnly}
                  placeholder="Link items from the inventory"
                  options={itemOptions}
                  value={itemOptions.filter((o) => d.itemAris.includes(o.value))}
                  onChange={(os) => update(d.key, { itemAris: os.map((o) => o.value) })}
                />
              </div>
              <div style={{ background: token('elevation.surface.sunken', '#F7F8F9'), borderRadius: 6, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ font: small, color: subtle }}>{name}’s answer</span>
                <span style={{ whiteSpace: 'pre-wrap', color: d.answer?.trim() ? undefined : subtle }}>
                  {d.answer?.trim() ? d.answer : d.id ? 'Not answered yet' : `${name} sees this once you save`}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      {error ? <ErrorNote error={error} name={name} /> : null}
      {saved && !dirty && (
        <span role="status" style={{ color: token('color.text.success', '#216E4E') }}>
          Questions saved. {name} sees this version now.
        </span>
      )}

      {!readOnly && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button isDisabled={busy} onClick={add}>
              Add a question
            </Button>
            <Button appearance="subtle" isDisabled={busy || h.items.length === 0} onClick={() => setConfirm({ kind: 'redraft' })}>
              {pending === 'redraft' ? 'Redrafting…' : 'Redraft with Baton'}
            </Button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {dirty && (
              <Button appearance="subtle" isDisabled={busy} onClick={() => setDrafts(toDrafts(h.questions))}>
                Discard changes
              </Button>
            )}
            <Button
              appearance="primary"
              isDisabled={busy || !dirty || Object.keys(errors).length > 0}
              onClick={() => void run('save', () => api.saveQuestions(h.id, toSave(drafts)))}
            >
              {pending === 'save' ? 'Saving…' : 'Save questions'}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm?.kind === 'redraft'}
        title="Replace these questions?"
        confirm="Replace questions"
        appearance="warning"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void run('redraft', () => api.generateQuestions(h.id, true));
        }}
      >
        <p>
          Baton drafts a new set from the current inventory{dirty ? ', and your unsaved edits are lost' : ''}. An answer stays only if its
          question comes back word for word.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm?.kind === 'remove'}
        title="Remove an answered question?"
        confirm="Remove question"
        appearance="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind === 'remove') remove(confirm.key);
          setConfirm(null);
        }}
      >
        <p>{name} has already answered it. The answer goes too once you save.</p>
      </ConfirmDialog>
    </div>
  );
};

const StatusNote = ({
  handover: h,
  name,
  onRefresh,
  refreshing,
  disabled,
}: {
  handover: Handover;
  name: string;
  onRefresh: () => void;
  refreshing: boolean;
  disabled: boolean;
}) => {
  const n = answered(h.questions);
  if (h.status === 'ready') {
    return (
      <SectionMessage appearance="success" title={`${name} has finished answering`}>
        <p>
          {n} of {h.questions.length} answered. Next, review the summary and publish the handover.
        </p>
      </SectionMessage>
    );
  }
  if (h.status === 'published') {
    return (
      <SectionMessage appearance="information" title="Published">
        <p>The handover is published, so its questions are read-only.</p>
      </SectionMessage>
    );
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: subtle }}>
        {h.status === 'collecting'
          ? `${name} can see and answer these in Baton. ${n} of ${h.questions.length} answered so far.`
          : `${name} sees these questions once you save them.`}
      </span>
      {h.status === 'collecting' && (
        <Button appearance="subtle" isDisabled={disabled} onClick={onRefresh}>
          {refreshing ? 'Checking…' : 'Check for new answers'}
        </Button>
      )}
    </div>
  );
};

const ErrorNote = ({ error, name }: { error: unknown; name: string }) =>
  error instanceof ApiError && error.code === 'llm_unavailable' ? (
    <SectionMessage appearance="warning" title="Baton couldn’t draft questions right now">
      <p>{error.message} You can still write questions for {name} yourself.</p>
    </SectionMessage>
  ) : (
    <SectionMessage appearance="error" title="That didn’t work">
      <p>{errorText(error)}</p>
    </SectionMessage>
  );

