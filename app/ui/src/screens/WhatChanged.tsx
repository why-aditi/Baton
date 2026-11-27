// "What changed since it was published": reads the person's work again and compares it with the
// published handover. Nothing is saved; run it as often as you like.
import Button from '@atlaskit/button/new';
import Lozenge from '@atlaskit/lozenge';
import { token } from '@atlaskit/tokens';
import { useState, type ReactNode } from 'react';
import { buildInventory } from '../../../src/graph/inventory';
import { PQ_PAGE_INBOUND_REFS, PQ_USER_OWNED_PAGES } from '../../../src/graph/queryKeys';
import type { Handover } from '../../../src/types';
import type { InventoryDiff } from '../api';
import { ErrorBanner, Loading } from '../components/States';
import { usePlatform } from '../platform';
import { BAND_LABEL, firstName } from '../view';

const subtle = token('color.text.subtle', '#44546F');

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <h3 style={{ margin: 0, font: token('font.heading.xsmall', '600 14px/16px sans-serif') }}>{title}</h3>
    <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</ul>
  </section>
);

export const WhatChanged = ({ handover: h }: { handover: Handover }) => {
  const { api, graph, openUrl } = usePlatform();
  const [state, setState] = useState<{ running?: boolean; diff?: InventoryDiff; error?: unknown }>({});
  const name = firstName(h.subjectName);

  const run = async () => {
    setState({ running: true });
    try {
      const { warnings: _warnings, ...inv } = await buildInventory({
        request: graph,
        subjectAri: h.subjectAri,
        subjectName: h.subjectName,
        ownedPagesQueryKey: PQ_USER_OWNED_PAGES,
        pageLinksQueryKey: PQ_PAGE_INBOUND_REFS,
      });
      setState({ diff: await api.compareInventory({ id: h.id, ...inv }) });
    } catch (error) {
      setState({ error });
    }
  };

  const link = (it: { title: string; key?: string; url: string }) => (
    <a
      href={it.url}
      onClick={(e) => {
        e.preventDefault();
        openUrl(it.url);
      }}
    >
      {it.key ? `${it.key} ${it.title}` : it.title}
    </a>
  );

  const d = state.diff;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, color: subtle }}>
        Reads {name}’s work again and compares it with the published handover: what’s new, what’s been handed over or
        closed, and what’s still with {name}. Nothing is saved.
      </p>
      <div>
        <Button onClick={() => void run()} isDisabled={state.running}>
          {d ? 'Check again' : 'Check what changed'}
        </Button>
      </div>
      {state.running && <Loading label={`Reading ${name}’s work`} />}
      {!!state.error && <ErrorBanner error={state.error} onRetry={() => void run()} />}
      {d && d.added.length + d.gone.length + d.stillOpen.length === 0 && (
        <p style={{ margin: 0 }}>Nothing has changed since it was published.</p>
      )}
      {d && d.added.length > 0 && (
        <Section title={`New since publishing (${d.added.length})`}>
          {d.added.map((it) => (
            <li key={it.ari} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {link(it)}
              <Lozenge appearance={it.band === 'high' ? 'removed' : it.band === 'medium' ? 'moved' : 'default'}>
                {BAND_LABEL[it.band]}
              </Lozenge>
            </li>
          ))}
        </Section>
      )}
      {d && d.gone.length > 0 && (
        <Section title={`No longer with ${name} (${d.gone.length})`}>
          {d.gone.map((it) => (
            <li key={it.ari}>
              {link(it)} <span style={{ color: subtle }}>{it.newOwner ? `→ ${it.newOwner}` : 'no owner was chosen'}</span>
            </li>
          ))}
        </Section>
      )}
      {d && d.stillOpen.length > 0 && (
        <Section title={`Still with ${name} (${d.stillOpen.length})`}>
          {d.stillOpen.map((it) => (
            <li key={it.ari}>
              {link(it)}{' '}
              <span style={{ color: it.riskNow > it.riskBefore ? token('color.text.danger', '#AE2E24') : subtle }}>
                {it.riskNow === it.riskBefore ? `risk ${it.riskNow}` : `risk ${it.riskBefore} → ${it.riskNow}`}
              </span>
            </li>
          ))}
        </Section>
      )}
    </div>
  );
};
