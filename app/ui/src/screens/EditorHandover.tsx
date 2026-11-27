// The handover as its manager and recipients see it: header with the stat line, then the Inventory
// and Questions tabs. The handover lives here so both tabs show the same, latest copy.
import Button from '@atlaskit/button/new';
import Lozenge from '@atlaskit/lozenge';
import SectionMessage from '@atlaskit/section-message';
import { token } from '@atlaskit/tokens';
import { useState } from 'react';
import type { Handover } from '../../../src/types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { errorText } from '../components/States';
import { usePlatform } from '../platform';
import { answered } from '../questions';
import { firstName, shortDate, statsFor } from '../view';
import { Inventory } from './Inventory';
import { QuestionsEditor } from './QuestionsEditor';
import { ReviewPublish } from './ReviewPublish';

export type Tab = 'inventory' | 'questions' | 'review';

const STATUS = {
  draft: { text: 'Draft', appearance: 'default' },
  collecting: { text: 'Collecting answers', appearance: 'inprogress' },
  ready: { text: 'Ready to publish', appearance: 'moved' },
  published: { text: 'Published', appearance: 'success' },
} as const;

const subtle = token('color.text.subtle', '#44546F');
const border = `1px solid ${token('color.border', '#091E4224')}`;

export const EditorHandover = ({ initial, autoBuild = false, initialTab = 'inventory' }: { initial: Handover; autoBuild?: boolean; initialTab?: Tab }) => {
  const { api, now, navigate } = usePlatform();
  const [h, setH] = useState(initial);
  const [tab, setTab] = useState<Tab>(initialTab);
  const stats = statsFor(h, now());
  const name = firstName(h.subjectName);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>(null);

  // The backend allows the person who started the handover, or a Jira admin; anyone else gets its message.
  const remove = async () => {
    setConfirmDelete(false);
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteHandover(h.id);
      navigate({ name: 'list' });
    } catch (e) {
      setDeleteError(e);
      setDeleting(false);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'inventory', label: `Inventory (${h.items.length})` },
    { id: 'questions', label: h.questions.length ? `Questions (${answered(h.questions)} of ${h.questions.length} answered)` : 'Questions' },
    { id: 'review', label: h.status === 'published' ? 'Published' : 'Review and publish' },
  ];

  return (
    <div>
      <header style={{ padding: '16px 24px 0', borderBottom: border, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <nav aria-label="Breadcrumb" style={{ color: subtle }}>
          <a
            href="#/"
            onClick={(e) => {
              e.preventDefault();
              navigate({ name: 'list' });
            }}
          >
            Handovers
          </a>{' '}
          / {h.subjectName}
        </nav>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, font: token('font.heading.medium', '600 20px/24px sans-serif') }}>
                {h.subjectName} · last day {shortDate(h.lastDay)}
              </h1>
              <Lozenge appearance={STATUS[h.status].appearance}>{STATUS[h.status].text}</Lozenge>
            </div>
            <span style={{ color: subtle, fontVariantNumeric: 'tabular-nums' }}>
              {stats.items} items · {stats.high} high · {stats.withoutOwner} without an owner · {stats.daysLeft} days left
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Button appearance="subtle" isDisabled={deleting} onClick={() => setConfirmDelete(true)}>
            {deleting ? 'Deleting…' : 'Delete handover'}
          </Button>
          {tab === 'inventory' && h.items.length > 0 && h.status !== 'published' && (
            <Button appearance="primary" onClick={() => setTab('questions')}>
              {h.questions.length ? `See ${name}’s answers` : `Ask ${name}`}
            </Button>
          )}
          {tab === 'questions' && h.questions.length > 0 && h.status !== 'published' && (
            <Button appearance={h.status === 'ready' ? 'primary' : 'default'} onClick={() => setTab('review')}>
              Review and publish
            </Button>
          )}
          </div>
        </div>
        {deleteError ? (
          <SectionMessage appearance="error" title="The handover wasn’t deleted">
            <p>{errorText(deleteError)}</p>
          </SectionMessage>
        ) : null}
        <ConfirmDialog
          open={confirmDelete}
          title={`Delete ${h.subjectName}’s handover?`}
          confirm="Delete handover"
          appearance="danger"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void remove()}
        >
          <p>
            This removes the handover, its inventory, owners and {name}’s answers from Baton for everyone, and can’t be undone.
            {h.confluencePageUrl ? ' The Confluence page it published stays.' : ''}
          </p>
        </ConfirmDialog>
        <div role="tablist" aria-label="Handover sections" style={{ display: 'flex', gap: 4 }}>
          {tabs.map((t) => {
            const on = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={on}
                aria-controls={`panel-${t.id}`}
                onClick={() => setTab(t.id)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  padding: '8px 12px',
                  fontWeight: 500,
                  color: on ? token('color.text.selected', '#0C66E4') : subtle,
                  borderBottom: `2px solid ${on ? token('color.border.selected', '#0C66E4') : 'transparent'}`,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </header>
      {/* Both panels stay mounted, so unsaved question edits survive a look at the inventory. */}
      <div role="tabpanel" id="panel-inventory" aria-labelledby="tab-inventory" hidden={tab !== 'inventory'}>
        <Inventory handover={h} onChange={setH} autoBuild={autoBuild} />
      </div>
      <div role="tabpanel" id="panel-questions" aria-labelledby="tab-questions" hidden={tab !== 'questions'}>
        <QuestionsEditor handover={h} onChange={setH} onShowInventory={() => setTab('inventory')} />
      </div>
      <div role="tabpanel" id="panel-review" aria-labelledby="tab-review" hidden={tab !== 'review'}>
        <ReviewPublish handover={h} onChange={setH} onShowTab={setTab} />
      </div>
    </div>
  );
};
