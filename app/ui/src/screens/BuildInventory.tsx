// Reads the departing person's work from Teamwork Graph, as the signed-in user, and saves it.
import Button from '@atlaskit/button/new';
import SectionMessage from '@atlaskit/section-message';
import { token } from '@atlaskit/tokens';
import { useState } from 'react';
import { buildInventory, type Progress } from '../../../src/graph/inventory';
import type { Warning } from '../../../src/graph/merge';
import { PQ_PAGE_INBOUND_REFS, PQ_USER_OWNED_PAGES } from '../../../src/graph/queryKeys';
import type { Handover } from '../../../src/types';
import { ErrorBanner } from '../components/States';
import { usePlatform } from '../platform';

const STEPS = ['assignedJira', 'reportedJira', 'pullRequests', 'pages', 'goalsAndProjects', 'teams', 'details'] as const;
const STEP_LABEL: Record<(typeof STEPS)[number], string> = {
  assignedJira: 'Assigned Jira work',
  reportedJira: 'Reported Jira work',
  pullRequests: 'Pull requests',
  pages: 'Confluence pages',
  goalsAndProjects: 'Goals and projects',
  teams: 'Teams',
  details: 'Collaborators and workload',
};

export const BuildInventory = ({
  handover,
  onDone,
  onCancel,
}: {
  handover: Handover;
  onDone: (h: Handover) => void;
  onCancel?: () => void;
}) => {
  const { api, graph } = usePlatform();
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [saved, setSaved] = useState<Handover | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    setProgress({});
    try {
      const inv = await buildInventory({
        request: graph,
        subjectAri: handover.subjectAri,
        // Finds Bitbucket PRs linked to their Jira issues, which are filed under third-party IDs.
        subjectName: handover.subjectName,
        ownedPagesQueryKey: PQ_USER_OWNED_PAGES,
        pageLinksQueryKey: PQ_PAGE_INBOUND_REFS,
        onProgress: (p) => setProgress((prev) => ({ ...prev, [p.source]: p })),
      });
      const { warnings: w, ...rest } = inv;
      const next = await api.saveInventory({ id: handover.id, ...rest });
      setWarnings(w);
      // Warnings are worth reading before the list replaces this panel.
      if (w.length) setSaved(next);
      else onDone(next);
    } catch (e) {
      setError(e);
    } finally {
      setRunning(false);
    }
  };

  const done = STEPS.filter((s) => progress[s]?.done).length;

  return (
    <div style={{ maxWidth: 640, margin: '40px auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2 style={{ margin: 0, font: token('font.heading.medium', '600 20px/24px sans-serif') }}>Build {handover.subjectName}’s inventory</h2>
        <p style={{ margin: 0, color: token('color.text.subtle', '#44546F') }}>
          Baton reads their open work through Teamwork Graph as you, so it only finds what you can see. Run this as someone who can see
          their projects, usually their manager. It takes several seconds.
        </p>
      </div>
      {(running || done > 0) && (
        <div role="status" aria-label="Progress" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div aria-hidden="true" style={{ height: 6, borderRadius: 3, background: token('color.background.neutral', '#091E420F'), overflow: 'hidden' }}>
            <div style={{ height: 6, width: `${(done / STEPS.length) * 100}%`, background: token('color.background.brand.bold', '#0C66E4'), transition: 'width 200ms ease-out' }} />
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 4 }}>
            {STEPS.map((s) => {
              const p = progress[s];
              return (
                <li key={s} style={{ display: 'flex', justifyContent: 'space-between', color: p?.done ? undefined : token('color.text.subtlest', '#626F86') }}>
                  <span>{STEP_LABEL[s]}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{p?.done ? p.count : p ? '…' : ''}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {warnings.map((w) => (
        <SectionMessage key={w.source + w.message} appearance={w.level === 'error' ? 'error' : w.level === 'warning' ? 'warning' : 'information'}>
          <p>{w.message}</p>
        </SectionMessage>
      ))}
      {error ? <ErrorBanner error={error} /> : null}
      <div style={{ display: 'flex', gap: 8 }}>
        {saved ? (
          <Button appearance="primary" onClick={() => onDone(saved)}>
            See the inventory
          </Button>
        ) : (
          <Button appearance="primary" isDisabled={running} onClick={() => void run()}>
            {running ? 'Building…' : error ? 'Try again' : 'Build inventory'}
          </Button>
        )}
        {onCancel && !running && !saved && <Button onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  );
};
