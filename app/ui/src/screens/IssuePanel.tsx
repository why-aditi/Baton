// The Jira issue panel: "This issue is in an open handover". Shows, for each handover the viewer can
// edit that contains this issue, who is leaving, the issue's risk and why, and who takes it over.
import Button from '@atlaskit/button/new';
import Lozenge from '@atlaskit/lozenge';
import { token } from '@atlaskit/tokens';
import { useEffect, useState } from 'react';
import type { IssueHandover } from '../api';
import { ErrorBanner, Loading } from '../components/States';
import { usePlatform } from '../platform';
import { BAND_LABEL, shortDate } from '../view';

const REASON_SHORT: Record<IssueHandover['reason'], string> = {
  leaving: 'Leaving',
  leave: 'Going on leave',
  team_change: 'Changing teams',
};

const subtle = token('color.text.subtle', '#44546F');

const ownerLine = (m: IssueHandover) =>
  !m.newOwner
    ? 'No new owner yet'
    : m.ownerStatus === 'accepted'
      ? `New owner: ${m.newOwner.name}`
      : `Suggested owner: ${m.newOwner.name} (not confirmed yet)`;

export const IssuePanel = ({ issueId, issueKey }: { issueId?: string; issueKey?: string }) => {
  const { api, openUrl } = usePlatform();
  const [state, setState] = useState<{ matches?: IssueHandover[]; error?: unknown }>({});

  const load = () => {
    setState({});
    api.issueHandovers({ issueId, issueKey }).then(
      (matches) => setState({ matches }),
      (error) => setState({ error }),
    );
  };
  useEffect(load, [issueId, issueKey]);

  if (state.error) return <ErrorBanner error={state.error} onRetry={load} />;
  if (!state.matches) return <Loading label="Checking handovers" />;
  if (state.matches.length === 0) {
    return <p style={{ margin: 0, padding: '8px 0', color: subtle }}>This issue isn’t in a handover you can see.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
      {state.matches.map((m) => (
        <section key={m.handoverId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, font: token('font.heading.xsmall', '600 14px/16px sans-serif') }}>
              In {m.subjectName}’s handover
            </h3>
            <Lozenge appearance={m.band === 'high' ? 'removed' : m.band === 'medium' ? 'moved' : 'default'}>
              {BAND_LABEL[m.band]}
            </Lozenge>
          </div>
          <span style={{ color: subtle }}>
            {REASON_SHORT[m.reason]} · last day {shortDate(m.lastDay)}
          </span>
          {m.reasons.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {m.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <span style={{ fontWeight: 600 }}>{ownerLine(m)}</span>
          <div>
            <Button onClick={() => openUrl(m.link)}>Open handover</Button>
          </div>
        </section>
      ))}
    </div>
  );
};
