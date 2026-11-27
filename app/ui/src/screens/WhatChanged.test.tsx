import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Api, InventoryDiff } from '../api';
import { handover } from '../fixtures';
import { PlatformProvider, type Platform } from '../platform';
import { WhatChanged } from './WhatChanged';

vi.mock('../../../src/graph/inventory', () => ({
  buildInventory: vi.fn(async () => ({ items: [{ ari: 'fresh' }], teams: [], openAssigned: {}, people: {}, warnings: [] })),
}));

afterEach(cleanup);

const ref = (n: number, title: string) => ({
  ari: `ari:${n}`,
  kind: 'jira_issue' as const,
  title,
  key: `PAY-${n}`,
  url: `https://x/browse/PAY-${n}`,
});

const diff = (over: Partial<InventoryDiff> = {}): InventoryDiff => ({
  added: [{ ...ref(4, 'New retry alert'), risk: 40, band: 'medium', reasons: ['Only Meera Iyer has worked on this'] }],
  gone: [
    { ...ref(2, 'Retry backoff'), newOwner: 'Arjun Rao' },
    { ...ref(5, 'Old page'), newOwner: null },
  ],
  stillOpen: [
    { ...ref(3, 'Runbook'), riskBefore: 40, riskNow: 60, bandNow: 'high', reasons: [] },
    { ...ref(1, 'Flaky test'), riskBefore: 20, riskNow: 20, bandNow: 'low', reasons: [] },
  ],
  ...over,
});

let compareInventory: ReturnType<typeof vi.fn>;
let openUrl: ReturnType<typeof vi.fn>;

const mount = () => {
  const platform = { api: { compareInventory } as unknown as Api, graph: vi.fn(), openUrl } as unknown as Platform;
  const h = { ...handover(), status: 'published' as const, subjectName: 'Meera Iyer' };
  render(
    <PlatformProvider value={platform}>
      <WhatChanged handover={h} />
    </PlatformProvider>,
  );
  return h;
};

beforeEach(() => {
  compareInventory = vi.fn(async () => diff());
  openUrl = vi.fn();
});

test('nothing runs until asked', () => {
  mount();
  expect(screen.getByRole('button', { name: 'Check what changed' })).toBeTruthy();
  expect(compareInventory).not.toHaveBeenCalled();
});

test('reads the graph and compares it with the published handover', async () => {
  const h = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Check what changed' }));
  await screen.findByText('New since publishing (1)');
  expect(compareInventory).toHaveBeenCalledWith({ id: h.id, items: [{ ari: 'fresh' }], teams: [], openAssigned: {}, people: {} });
});

test('shows what is new, what moved on and to whom, and what is still with them', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Check what changed' }));
  expect(await screen.findByText('New since publishing (1)')).toBeTruthy();
  expect(screen.getByText('No longer with Meera (2)')).toBeTruthy();
  expect(screen.getByText('Still with Meera (2)')).toBeTruthy();
  expect(screen.getByText('PAY-4 New retry alert')).toBeTruthy();
  expect(screen.getByText('planned for Arjun Rao')).toBeTruthy();
  expect(screen.getByText('no owner was chosen')).toBeTruthy();
  expect(screen.getByText('risk 40 → 60')).toBeTruthy();
  expect(screen.getByText('risk 20')).toBeTruthy();
});

test('items open in a new tab', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Check what changed' }));
  fireEvent.click(await screen.findByText('PAY-4 New retry alert'));
  expect(openUrl).toHaveBeenCalledWith('https://x/browse/PAY-4');
});

test('says so when nothing changed', async () => {
  compareInventory = vi.fn(async () => diff({ added: [], gone: [], stillOpen: [] }));
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Check what changed' }));
  expect(await screen.findByText('Nothing has changed since it was published.')).toBeTruthy();
});

test('an error shows the error banner', async () => {
  compareInventory = vi.fn(async () => {
    throw new Error('boom');
  });
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Check what changed' }));
  expect(await screen.findByText('That didn’t work')).toBeTruthy();
});
