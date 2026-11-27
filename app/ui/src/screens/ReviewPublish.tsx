// Review and publish: check what's ready, edit the summary Baton drafts, publish it to Confluence,
// and reassign the Jira issues to their confirmed owners after a dialog that lists every change.
import Button from '@atlaskit/button/new';
import Select from '@atlaskit/select';
import SectionMessage from '@atlaskit/section-message';
import TextArea from '@atlaskit/textarea';
import { token } from '@atlaskit/tokens';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { pageTitle } from '../../../src/publish/page';
import type { Handover } from '../../../src/types';
import { ApiError, type ReassignResult } from '../api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { errorText } from '../components/States';
import { usePlatform } from '../platform';
import { WhatChanged } from './WhatChanged';
import {
  EMPTY_SUMMARY,
  fromSummaryDraft,
  readiness,
  reassignable,
  summaryDirty,
  toSummaryDraft,
  changeLabel,
  type SummaryDraft,
} from '../review';
import { firstName, personName } from '../view';

const subtle = token('color.text.subtle', '#44546F');
const small = token('font.body.small', '400 12px/16px sans-serif');
const border = `1px solid ${token('color.border', '#091E4224')}`;

type Pending = 'generate' | 'save' | 'publish' | 'reassign' | null;

export const ReviewPublish = ({
  handover: h,
  onChange,
  onShowTab,
}: {
  handover: Handover;
  onChange: (h: Handover) => void;
  onShowTab: (tab: 'inventory' | 'questions') => void;
}) => {
  const { api } = usePlatform();
  const [draft, setDraft] = useState<SummaryDraft | null>(() => (h.summary ? toSummaryDraft(h.summary) : null));
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<{ where: 'summary' | 'publish' | 'reassign'; error: unknown } | null>(null);
  const [confirm, setConfirm] = useState<'regenerate' | 'publish' | 'reassign' | null>(null);
  const [spaceKey, setSpaceKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(reassignable(h).map((i) => i.ari)));
  const [results, setResults] = useState<ReassignResult[] | null>(null);

  const ready = readiness(h);
  const published = h.status === 'published';
  const dirty = draft ? summaryDirty(draft, h.summary) : false;
  const name = firstName(h.subjectName);
  const issues = reassignable(h);
  const busy = pending !== null;

  // A summary regenerated elsewhere (or the first one) replaces the copy here unless it has edits.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (h.summary && !dirtyRef.current) setDraft(toSummaryDraft(h.summary));
  }, [h.summary]);

  // New confirmed owners join the reassign list, ticked.
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((a) => issues.some((i) => i.ari === a)));
      for (const i of issues) if (!prev.has(i.ari) && !results) next.add(i.ari);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issues.map((i) => i.ari + i.acceptedOwnerAccountId).join()]);

  const run = async (kind: Exclude<Pending, null>, where: 'summary' | 'publish' | 'reassign', fn: () => Promise<void>) => {
    setPending(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError({ where, error: e });
    } finally {
      setPending(null);
    }
  };

  const generate = (regenerate: boolean) =>
    run('generate', 'summary', async () => {
      const next = await api.generateSummary(h.id, regenerate);
      onChange(next);
      if (next.summary) setDraft(toSummaryDraft(next.summary));
    });

  const saveSummary = async () => {
    if (!draft) return h;
    const next = await api.updateSummary(h.id, fromSummaryDraft(draft));
    onChange(next);
    setDraft(toSummaryDraft(next.summary ?? EMPTY_SUMMARY));
    return next;
  };

  const publish = () =>
    run('publish', 'publish', async () => {
      if (dirty) await saveSummary();
      onChange(await api.publishHandover(h.id, spaceKey!));
    });

  const reassign = () =>
    run('reassign', 'reassign', async () => {
      const r = await api.reassignIssues(h.id, [...selected]);
      setResults(r.results);
    });

  const canPublish = !published && !!draft && fromSummaryDraft(draft).overview.length > 0 && !!spaceKey && !busy;

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 24px 64px', display: 'flex', flexDirection: 'column', gap: 28 }}>
      <Checklist ready={ready} name={name} onShowTab={onShowTab} published={published} />

      <Card title="Summary">
        {!draft ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, color: subtle }}>
              Baton writes an overview, the main risks and a section per new owner, from the inventory, the owners you confirmed and{' '}
              {name}’s answers. You edit it before publishing.
            </p>
            {error?.where === 'summary' ? <ErrorNote error={error.error} what="the summary" /> : null}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button appearance="primary" isDisabled={busy || published || h.items.length === 0} onClick={() => void generate(false)}>
                {pending === 'generate' ? 'Writing…' : 'Generate handover'}
              </Button>
              <Button isDisabled={busy || published} onClick={() => setDraft(toSummaryDraft(EMPTY_SUMMARY))}>
                Write it myself
              </Button>
            </div>
          </div>
        ) : (
          <SummaryEditor draft={draft} onChange={setDraft} handover={h} readOnly={published} />
        )}
        {draft && !published && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
            <Button appearance="subtle" isDisabled={busy || h.items.length === 0} onClick={() => setConfirm('regenerate')}>
              {pending === 'generate' ? 'Writing…' : 'Regenerate'}
            </Button>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {error?.where === 'summary' ? <span style={{ color: token('color.text.danger', '#AE2E24') }}>{errorText(error.error)}</span> : null}
              {dirty && (
                <Button appearance="subtle" isDisabled={busy} onClick={() => setDraft(h.summary ? toSummaryDraft(h.summary) : null)}>
                  Discard changes
                </Button>
              )}
              <Button isDisabled={busy || !dirty} onClick={() => void run('save', 'summary', async () => void (await saveSummary()))}>
                {pending === 'save' ? 'Saving…' : 'Save summary'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card title="Publish to Confluence">
        {published ? (
          <SectionMessage appearance="success" title="Published">
            <p>
              {h.confluencePageUrl ? (
                <PageLink url={h.confluencePageUrl}>{pageTitle(h)}</PageLink>
              ) : (
                pageTitle(h)
              )}{' '}
              is live, with every new owner @mentioned.
            </p>
          </SectionMessage>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, color: subtle }}>
              Creates the page “{pageTitle(h)}” as you, so it follows your Confluence permissions. New owners are @mentioned and get
              notified.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 280px', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label htmlFor="space" style={{ fontWeight: 600 }}>
                  Space
                </label>
                <SpacePicker value={spaceKey} onChange={setSpaceKey} />
              </div>
              <Button appearance="primary" isDisabled={!canPublish} onClick={() => setConfirm('publish')}>
                {pending === 'publish' ? 'Publishing…' : 'Publish to Confluence'}
              </Button>
            </div>
            {!draft || !fromSummaryDraft(draft).overview ? (
              <span style={{ color: subtle, font: small }}>Write or generate the summary’s overview first.</span>
            ) : null}
            {error?.where === 'publish' ? <ErrorNote error={error.error} what="the page" /> : null}
          </div>
        )}
      </Card>

      {published && (
        <Card title="What changed since publishing">
          <WhatChanged handover={h} />
        </Card>
      )}

      <Card title="Reassign Jira issues">
        <ReassignList
          handover={h}
          issues={issues}
          selected={selected}
          onToggle={(ari) =>
            setSelected((s) => {
              const n = new Set(s);
              if (n.has(ari)) n.delete(ari);
              else n.add(ari);
              return n;
            })
          }
          results={results}
        />
        {error?.where === 'reassign' ? <ErrorNote error={error.error} what="the issues" /> : null}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button appearance="primary" isDisabled={busy || selected.size === 0} onClick={() => setConfirm('reassign')}>
            {pending === 'reassign' ? 'Reassigning…' : `Reassign ${selected.size} ${selected.size === 1 ? 'issue' : 'issues'}`}
          </Button>
          {h.items.some((i) => i.kind === 'jira_issue' && !i.acceptedOwnerAccountId) && (
            <span style={{ color: subtle, font: small }}>
              Issues without a confirmed owner aren’t listed.{' '}
              <a
                href="#inventory"
                onClick={(e) => {
                  e.preventDefault();
                  onShowTab('inventory');
                }}
              >
                Confirm owners
              </a>
            </span>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={confirm === 'regenerate'}
        title="Replace the summary?"
        confirm="Replace summary"
        appearance="warning"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void generate(true);
        }}
      >
        <p>Baton writes a new summary from the current inventory, owners and answers. Your edits to this one are lost.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'publish'}
        title="Publish the handover?"
        confirm="Publish to Confluence"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void publish();
        }}
      >
        <p>
          Baton creates “{pageTitle(h)}” in {spaceKey}
          {dirty ? ' with your unsaved edits' : ''}. After that, owners and questions can’t change here.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'reassign'}
        title={`Reassign ${selected.size} ${selected.size === 1 ? 'issue' : 'issues'}?`}
        confirm={`Reassign ${selected.size} ${selected.size === 1 ? 'issue' : 'issues'}`}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void reassign();
        }}
      >
        <p style={{ marginTop: 0 }}>Each issue’s assignee changes in Jira, as you:</p>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {issues
            .filter((i) => selected.has(i.ari))
            .map((i) => (
              <li key={i.ari}>
                <b>{i.key}</b> {i.title}: {changeLabel(i, h.subjectName, personName(h, i.acceptedOwnerAccountId))}
              </li>
            ))}
        </ul>
      </ConfirmDialog>
    </div>
  );
};

const Card = ({ title, children }: { title: string; children: ReactNode }) => (
  <section aria-label={title} style={{ border, borderRadius: 8, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
    <h2 style={{ margin: 0, font: token('font.heading.small', '600 16px/20px sans-serif') }}>{title}</h2>
    {children}
  </section>
);

const Checklist = ({
  ready,
  name,
  published,
  onShowTab,
}: {
  ready: ReturnType<typeof readiness>;
  name: string;
  published: boolean;
  onShowTab: (tab: 'inventory' | 'questions') => void;
}) => {
  const rows: { ok: boolean; text: string; tab?: 'inventory' | 'questions' }[] = [
    { ok: ready.confirmedOwners === ready.items && ready.items > 0, text: `${ready.confirmedOwners} of ${ready.items} items have a confirmed owner`, tab: 'inventory' },
    { ok: ready.questions > 0 && ready.answered === ready.questions, text: ready.questions ? `${ready.answered} of ${ready.questions} questions answered by ${name}` : `No questions for ${name} yet`, tab: 'questions' },
    { ok: ready.hasSummary, text: ready.hasSummary ? 'Summary written' : 'No summary yet' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ul aria-label="Before publishing" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r) => (
          <li key={r.text} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: small, color: token('color.text.inverse', '#FFFFFF'), background: r.ok ? token('color.background.success.bold', '#1F845A') : token('color.background.neutral.bold', '#44546F') }}>
              {r.ok ? '✓' : '·'}
            </span>
            <span>{r.text}</span>
            {!r.ok && r.tab && !published && (
              <a
                href={`#${r.tab}`}
                onClick={(e) => {
                  e.preventDefault();
                  onShowTab(r.tab!);
                }}
                style={{ font: small }}
              >
                Open {r.tab === 'inventory' ? 'Inventory' : 'Questions'}
              </a>
            )}
          </li>
        ))}
      </ul>
      {ready.highWithoutOwner.length > 0 && !published && (
        <SectionMessage appearance="warning" title={`${ready.highWithoutOwner.length} high-risk ${ready.highWithoutOwner.length === 1 ? 'item has' : 'items have'} no confirmed owner`}>
          <p>{ready.highWithoutOwner.map((i) => i.key ?? i.title).join(', ')}. You can still publish; they’ll show as unassigned on the page.</p>
        </SectionMessage>
      )}
    </div>
  );
};

const SummaryEditor = ({
  draft,
  onChange,
  handover: h,
  readOnly,
}: {
  draft: SummaryDraft;
  onChange: (d: SummaryDraft) => void;
  handover: Handover;
  readOnly: boolean;
}) => {
  const byAri = useMemo(() => new Map(h.items.map((i) => [i.ari, i])), [h.items]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Labeled id="overview" label="Overview">
        <TextArea id="overview" value={draft.overview} isReadOnly={readOnly} minimumRows={3} placeholder="What’s being handed over, and to whom" onChange={(e) => onChange({ ...draft, overview: e.currentTarget.value })} />
      </Labeled>
      <Labeled id="risks" label="Main risks" help="One per line.">
        <TextArea id="risks" value={draft.risks} isReadOnly={readOnly} minimumRows={3} onChange={(e) => onChange({ ...draft, risks: e.currentTarget.value })} />
      </Labeled>
      {draft.sections.map((s, i) => {
        const id = `section-${i}`;
        return (
          <Labeled key={id} id={id} label={s.ownerAccountId ? `For ${personName(h, s.ownerAccountId)}` : 'Not yet assigned'} help={s.itemAris.map((a) => byAri.get(a)?.key ?? byAri.get(a)?.title).filter(Boolean).join(', ')}>
            <TextArea
              id={id}
              value={s.body}
              isReadOnly={readOnly}
              minimumRows={2}
              onChange={(e) => {
                const sections = [...draft.sections];
                sections[i] = { ...s, body: e.currentTarget.value };
                onChange({ ...draft, sections });
              }}
            />
          </Labeled>
        );
      })}
    </div>
  );
};

const Labeled = ({ id, label, help, children }: { id: string; label: string; help?: string; children: ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <label htmlFor={id} style={{ fontWeight: 600 }}>
      {label}
    </label>
    {children}
    {help ? <span style={{ color: subtle, font: small }}>{help}</span> : null}
  </div>
);

const SpacePicker = ({ value, onChange }: { value: string | null; onChange: (k: string | null) => void }) => {
  const { listSpaces } = usePlatform();
  const [spaces, setSpaces] = useState<{ label: string; value: string }[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    listSpaces().then(
      (s) => setSpaces(s.map((x) => ({ label: `${x.name} (${x.key})`, value: x.key }))),
      () => setFailed(true),
    );
  }, [listSpaces]);
  if (failed) {
    return <span style={{ color: token('color.text.danger', '#AE2E24') }}>Couldn’t load your Confluence spaces. Reload to try again.</span>;
  }
  return (
    <Select
      inputId="space"
      isLoading={!spaces}
      placeholder="Choose a space"
      options={spaces ?? []}
      value={spaces?.find((s) => s.value === value) ?? null}
      onChange={(o) => onChange(o?.value ?? null)}
    />
  );
};

const ReassignList = ({
  handover: h,
  issues,
  selected,
  onToggle,
  results,
}: {
  handover: Handover;
  issues: Handover['items'];
  selected: Set<string>;
  onToggle: (ari: string) => void;
  results: ReassignResult[] | null;
}) => {
  if (issues.length === 0) {
    return <p style={{ margin: 0, color: subtle }}>No Jira issues have a confirmed new owner yet.</p>;
  }
  const byAri = new Map((results ?? []).map((r) => [r.ari, r]));
  const failed = (results ?? []).filter((r) => !r.ok).length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {results && (
        <SectionMessage appearance={failed ? 'warning' : 'success'} title={failed ? `${failed} of ${results.length} couldn’t be reassigned` : `${results.length} ${results.length === 1 ? 'issue' : 'issues'} reassigned`}>
          <p>{failed ? 'The others moved. Check the failed ones in Jira, then try them again.' : 'Their new owners are now the assignees in Jira.'}</p>
        </SectionMessage>
      )}
      <ul aria-label="Issues to reassign" style={{ margin: 0, padding: 0, listStyle: 'none', border, borderRadius: 8 }}>
        {issues.map((i) => {
          const r = byAri.get(i.ari);
          return (
            <li key={i.ari} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 14px', borderBottom: border }}>
              <input id={`re-${i.ari}`} type="checkbox" checked={selected.has(i.ari)} onChange={() => onToggle(i.ari)} style={{ marginTop: 3 }} />
              <label htmlFor={`re-${i.ari}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', cursor: 'pointer' }}>
                <span>
                  <b style={{ fontWeight: 600 }}>{i.key}</b> {i.title}
                </span>
                <span style={{ color: subtle, font: small }}>
                  {changeLabel(i, h.subjectName, personName(h, i.acceptedOwnerAccountId))}
                </span>
                {r && !r.ok && <span style={{ color: token('color.text.danger', '#AE2E24'), font: small }}>Failed: {r.error ?? 'unknown error'}</span>}
              </label>
              {r?.ok && <span style={{ color: token('color.text.success', '#216E4E'), font: small }}>Reassigned</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const PageLink = ({ url, children }: { url: string; children: ReactNode }) => {
  const { openUrl } = usePlatform();
  return (
    <a
      href={url}
      onClick={(e) => {
        e.preventDefault();
        openUrl(url);
      }}
    >
      {children}
    </a>
  );
};

const ErrorNote = ({ error, what }: { error: unknown; what: string }) =>
  error instanceof ApiError && error.code === 'llm_unavailable' ? (
    <SectionMessage appearance="warning" title="Baton couldn’t write the summary right now">
      <p>{error.message} You can write it yourself instead.</p>
    </SectionMessage>
  ) : (
    <SectionMessage appearance="error" title={`Couldn’t save ${what}`}>
      <p>{errorText(error)}</p>
    </SectionMessage>
  );
