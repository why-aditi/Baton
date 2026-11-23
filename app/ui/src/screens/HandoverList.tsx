import Button from '@atlaskit/button/new';
import Lozenge from '@atlaskit/lozenge';
import { token } from '@atlaskit/tokens';
import { useCallback, useEffect, useState } from 'react';
import type { Status } from '../../../src/types';
import type { HandoverRow } from '../api';
import { EmptyState, ErrorBanner, Loading } from '../components/States';
import { usePlatform } from '../platform';
import { shortDate } from '../view';

const STATUS: Record<Status, { text: string; appearance: 'default' | 'inprogress' | 'moved' | 'success' }> = {
  draft: { text: 'Draft', appearance: 'default' },
  collecting: { text: 'Collecting answers', appearance: 'inprogress' },
  ready: { text: 'Ready to publish', appearance: 'moved' },
  published: { text: 'Published', appearance: 'success' },
};

const REASON = { leaving: 'Leaving', leave: 'Going on leave', team_change: 'Changing teams' } as const;

const cell = { padding: '10px 12px', textAlign: 'left' as const, borderBottom: `1px solid ${token('color.border', '#091E4224')}` };

export const HandoverList = () => {
  const { api, navigate } = usePlatform();
  const [rows, setRows] = useState<HandoverRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    setRows(null);
    api.listHandovers().then(setRows, setError);
  }, [api]);
  useEffect(load, [load]);

  return (
    <main style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 24px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, font: token('font.heading.large', '600 24px/28px sans-serif') }}>Handovers</h1>
        <Button appearance="primary" onClick={() => navigate({ name: 'new' })}>New handover</Button>
      </div>
      {error ? (
        <ErrorBanner error={error} onRetry={load} />
      ) : !rows ? (
        <Loading label="Loading handovers" />
      ) : rows.length === 0 ? (
        <EmptyState title="No handovers yet" action={<Button onClick={() => navigate({ name: 'new' })}>Start a handover</Button>}>
          When someone leaves, goes on leave or changes teams, start a handover here, or ask the Baton agent in Rovo to start one.
        </EmptyState>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: token('color.text.subtle', '#44546F') }}>
                <th scope="col" style={cell}>Person</th>
                <th scope="col" style={cell}>Reason</th>
                <th scope="col" style={cell}>Last day</th>
                <th scope="col" style={cell}>Status</th>
                <th scope="col" style={cell}>Progress</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={cell}>
                    <a
                      href={`#/handover/${r.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate({ name: 'handover', id: r.id });
                      }}
                      style={{ fontWeight: 500 }}
                    >
                      {r.subjectName}
                    </a>
                    {r.role === 'subject' && <span style={{ color: token('color.text.subtle', '#44546F') }}> · your handover</span>}
                  </td>
                  <td style={cell}>{REASON[r.reason]}</td>
                  <td style={cell}>{shortDate(r.lastDay)}</td>
                  <td style={cell}>
                    <Lozenge appearance={STATUS[r.status].appearance}>{STATUS[r.status].text}</Lozenge>
                  </td>
                  <td style={{ ...cell, color: token('color.text.subtle', '#44546F') }}>
                    {r.itemCount} items · {r.highCount} high
                    {r.questionCount > 0 && ` · ${r.answeredCount} of ${r.questionCount} answered`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
};
