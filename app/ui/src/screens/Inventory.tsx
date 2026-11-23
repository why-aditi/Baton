// The Inventory screen in the split layout: a risk-sorted list on the left, the selected item on the
// right with its score broken down, owner choice and the questions that mention it.
import Button from '@atlaskit/button/new';
import Lozenge from '@atlaskit/lozenge';
import Select from '@atlaskit/select';
import SectionMessage from '@atlaskit/section-message';
import { token } from '@atlaskit/tokens';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Handover, ScoredItem } from '../../../src/types';
import { ErrorBanner, EmptyState } from '../components/States';
import { usePlatform } from '../platform';
import {
  BAND_LABEL,
  breakdown,
  ownerOf,
  personName,
  pickablePeople,
  questionsFor,
  shortDate,
  sourceLine,
  statsFor,
  statusLine,
} from '../view';
import { BuildInventory } from './BuildInventory';

const subtle = token('color.text.subtle', '#44546F');
const border = `1px solid ${token('color.border', '#091E4224')}`;
const bandColor = (band: ScoredItem['band']) =>
  band === 'high' ? token('color.text.danger', '#AE2E24') : band === 'medium' ? token('color.text.warning', '#A54800') : subtle;

export const Inventory = ({ initial }: { initial: Handover }) => {
  const { now } = usePlatform();
  const [h, setH] = useState(initial);
  const [rebuilding, setRebuilding] = useState(false);
  const [selectedAri, setSelectedAri] = useState(initial.items[0]?.ari);
  const stats = statsFor(h, now());
  const selected = h.items.find((i) => i.ari === selectedAri) ?? h.items[0];

  const onBuilt = (next: Handover) => {
    setH(next);
    setRebuilding(false);
    setSelectedAri(next.items[0]?.ari);
  };

  const building = rebuilding || (h.items.length === 0 && h.status === 'draft');

  return (
    <div>
      <header style={{ padding: '20px 24px', borderBottom: border, display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h1 style={{ margin: 0, font: token('font.heading.medium', '600 20px/24px sans-serif') }}>
            {h.subjectName} · last day {shortDate(h.lastDay)}
          </h1>
          <span style={{ color: subtle, fontVariantNumeric: 'tabular-nums' }}>
            {stats.items} items · {stats.high} high · {stats.withoutOwner} without an owner · {stats.daysLeft} days left
          </span>
        </div>
        {h.status !== 'published' && !building && (
          <Button onClick={() => setRebuilding(true)}>Rebuild inventory</Button>
        )}
      </header>
      {building ? (
        <BuildInventory handover={h} onDone={onBuilt} onCancel={h.items.length ? () => setRebuilding(false) : undefined} />
      ) : h.items.length === 0 ? (
        <EmptyState title="No open work found">
          Baton found nothing open for {h.subjectName}. If that seems wrong, check that Baton’s Teamwork Graph scopes are granted, and
          that you can see their projects.
        </EmptyState>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          <ItemList items={h.items} handover={h} selected={selected?.ari} onSelect={setSelectedAri} />
          {selected && <ItemDetail key={selected.ari} item={selected} handover={h} onChange={setH} />}
        </div>
      )}
    </div>
  );
};

const ItemList = ({
  items,
  handover,
  selected,
  onSelect,
}: {
  items: ScoredItem[];
  handover: Handover;
  selected?: string;
  onSelect: (ari: string) => void;
}) => {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  // Arrow keys move through the list, so a manager can triage without the mouse.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = items.findIndex((x) => x.ari === selected);
    const next = items[Math.min(items.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (next) {
      onSelect(next.ari);
      refs.current[items.indexOf(next)]?.focus();
    }
  };
  return (
    <nav aria-label="Items" onKeyDown={onKeyDown} style={{ flex: '1 1 340px', maxWidth: 460, borderRight: border, padding: '8px 0' }}>
      {items.map((it, i) => {
        const owner = ownerOf(it);
        const isSel = it.ari === selected;
        return (
          <button
            key={it.ari}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            aria-current={isSel ? 'true' : undefined}
            onClick={() => onSelect(it.ari)}
            style={{
              all: 'unset',
              boxSizing: 'border-box',
              width: '100%',
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              padding: '10px 20px',
              cursor: 'pointer',
              background: isSel ? token('color.background.selected', '#E9F2FF') : 'transparent',
            }}
          >
            <span style={{ fontWeight: 600, width: 24, fontVariantNumeric: 'tabular-nums', color: bandColor(it.band) }}>{it.risk}</span>
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</span>
              <span style={{ color: subtle, font: token('font.body.small', '400 12px/16px sans-serif') }}>
                {sourceLine(it)} · {owner ? personName(handover, owner) : 'no owner yet'}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
};

const SOMEONE_ELSE = '__someone_else__';

const ItemDetail = ({ item, handover, onChange }: { item: ScoredItem; handover: Handover; onChange: (h: Handover) => void }) => {
  const { api, openUrl } = usePlatform();
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const current = item.acceptedOwnerAccountId;
  const suggested = new Set(item.suggestions.map((s) => s.accountId));
  const [otherOpen, setOtherOpen] = useState(!!current && !suggested.has(current));
  const people = useMemo(() => pickablePeople(handover).map((p) => ({ label: p.name, value: p.accountId })), [handover]);
  const rows = breakdown(item);
  const questions = questionsFor(handover, item.ari);

  const choose = async (accountId: string | null) => {
    setError(null);
    setSaving(true);
    try {
      onChange(await api.setOwner(handover.id, item.ari, accountId));
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="Selected item" style={{ flex: '999 1 520px', minWidth: 0, padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ color: subtle }}>{[sourceLine(item), statusLine(item)].filter(Boolean).join(' · ')}</span>
        <h2 style={{ margin: 0, font: token('font.heading.medium', '600 20px/24px sans-serif') }}>
          <a
            href={item.url}
            onClick={(e) => {
              e.preventDefault();
              openUrl(item.url);
            }}
            style={{ color: 'inherit' }}
          >
            {item.title}
          </a>
        </h2>
        {item.oneLine && <p style={{ margin: 0, color: subtle }}>{item.oneLine}</p>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h3 style={{ margin: 0, font: token('font.heading.xsmall', '600 14px/16px sans-serif') }}>Why it scores {item.risk}</h3>
        <div style={{ border, borderRadius: 8 }}>
          {rows.length === 0 ? (
            <div style={{ padding: '10px 16px', color: subtle }}>No risk signals. Someone else already has context on this.</div>
          ) : (
            rows.map((r) => (
              <div key={r.reason} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 16px', borderBottom: border }}>
                <span>{r.reason}</span>
                <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>+{r.points}</span>
              </div>
            ))
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: token('elevation.surface.sunken', '#F7F8F9'), borderRadius: '0 0 8px 8px' }}>
            <Lozenge appearance={item.band === 'high' ? 'removed' : item.band === 'medium' ? 'moved' : 'default'}>{BAND_LABEL[item.band]}</Lozenge>
            <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{item.risk} / 100</span>
          </div>
        </div>
      </div>

      <fieldset disabled={saving || handover.status === 'published'} style={{ margin: 0, padding: 0, border: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <legend style={{ font: token('font.heading.xsmall', '600 14px/16px sans-serif'), marginBottom: 8 }}>Who takes it</legend>
        {item.suggestions.length === 0 && <span style={{ color: subtle }}>Baton found nobody well placed. Pick someone below.</span>}
        {item.suggestions.map((s, i) => (
          <OwnerOption
            key={s.accountId}
            name={personName(handover, s.accountId) + (i === 0 ? ' (best match)' : '')}
            detail={s.reason}
            checked={!otherOpen && current === s.accountId}
            onSelect={() => {
              setOtherOpen(false);
              void choose(s.accountId);
            }}
          />
        ))}
        <OwnerOption name="Someone else" checked={otherOpen} onSelect={() => setOtherOpen(true)} />
        {otherOpen && (
          <div style={{ maxWidth: 360, paddingLeft: 28 }}>
            <Select
              inputId={`owner-${item.ari}`}
              aria-label="Choose the new owner"
              placeholder="Choose a person"
              options={people}
              value={people.find((p) => p.value === current) ?? null}
              onChange={(o) => o && void choose(o.value)}
            />
          </div>
        )}
        {current && (
          <div>
            <Button appearance="subtle" onClick={() => { setOtherOpen(false); void choose(null); }}>
              Clear owner
            </Button>
          </div>
        )}
        {!current && (
          <span style={{ color: subtle, font: token('font.body.small', '400 12px/16px sans-serif') }}>
            No owner confirmed yet. Reassigning uses the confirmed owner only.
          </span>
        )}
      </fieldset>
      {error ? <ErrorBanner error={error} /> : null}

      {questions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3 style={{ margin: 0, font: token('font.heading.xsmall', '600 14px/16px sans-serif') }}>
            {questions.length === 1 ? 'Question' : 'Questions'} for {handover.subjectName}
          </h3>
          {questions.map((q) => (
            <div key={q.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>“{q.text}”</span>
              <span style={{ color: subtle }}>{q.answer?.trim() ? q.answer : 'Not answered yet'}</span>
            </div>
          ))}
        </div>
      )}
      {handover.status === 'published' && (
        <SectionMessage appearance="information" title="Published">
          <p>This handover is published, so owners can’t change here any more.</p>
        </SectionMessage>
      )}
    </section>
  );
};

const OwnerOption = ({ name, detail, checked, onSelect }: { name: string; detail?: string; checked: boolean; onSelect: () => void }) => (
  <label
    style={{
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start',
      padding: '12px 16px',
      borderRadius: 8,
      cursor: 'pointer',
      border: checked ? `1px solid ${token('color.border.selected', '#0C66E4')}` : border,
      background: checked ? token('color.background.selected', '#E9F2FF') : 'transparent',
    }}
  >
    <input type="radio" name="owner" checked={checked} onChange={onSelect} style={{ marginTop: 3 }} />
    <span style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontWeight: 500 }}>{name}</span>
      {detail && <span style={{ color: subtle, font: token('font.body.small', '400 12px/16px sans-serif') }}>{detail}</span>}
    </span>
  </label>
);
