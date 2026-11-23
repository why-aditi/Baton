import SectionMessage from '@atlaskit/section-message';
import { useCallback, useEffect, useState } from 'react';
import type { HandoverView } from '../api';
import { ErrorBanner, Loading } from '../components/States';
import { usePlatform } from '../platform';
import { Inventory } from './Inventory';

/** Loads one handover and picks the screen for the caller's role. */
export const HandoverScreen = ({ id }: { id: string }) => {
  const { api } = usePlatform();
  const [view, setView] = useState<HandoverView | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    setView(null);
    api.getHandover(id).then(setView, setError);
  }, [api, id]);
  useEffect(load, [load]);

  if (error) return <div style={{ padding: 24 }}><ErrorBanner error={error} onRetry={load} /></div>;
  if (!view) return <Loading label="Loading handover" />;
  if (view.role === 'editor') return <Inventory initial={view.handover} />;
  // The departing person's knowledge-capture screen comes next; until then, say what's waiting.
  return (
    <div style={{ padding: 24 }}>
      <SectionMessage title={`${view.questions.length} questions about your work`}>
        <p>The screen for answering them isn’t built yet.</p>
      </SectionMessage>
    </div>
  );
};
