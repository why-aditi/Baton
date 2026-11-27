import { useCallback, useEffect, useState } from 'react';
import type { HandoverView } from '../api';
import { ErrorBanner, Loading } from '../components/States';
import { usePlatform } from '../platform';
import { EditorHandover } from './EditorHandover';
import { KnowledgeCapture } from './KnowledgeCapture';

/** Loads one handover and picks the screen for the caller's role. */
export const HandoverScreen = ({ id, build = false }: { id: string; build?: boolean }) => {
  const { api, navigate } = usePlatform();
  const [view, setView] = useState<HandoverView | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    setView(null);
    api.getHandover(id).then(setView, setError);
  }, [api, id]);
  useEffect(load, [load]);

  if (error) {
    // Without the handover there's no header, so give a way back to the list as well as a retry.
    return (
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <nav aria-label="Breadcrumb">
          <a
            href="#/"
            onClick={(e) => {
              e.preventDefault();
              navigate({ name: 'list' });
            }}
          >
            Back to handovers
          </a>
        </nav>
        <ErrorBanner error={error} onRetry={load} />
      </div>
    );
  }
  if (!view) return <Loading label="Loading handover" />;
  return view.role === 'editor' ? <EditorHandover initial={view.handover} autoBuild={build} /> : <KnowledgeCapture initial={view} />;
};
