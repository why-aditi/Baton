import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Api } from '../api';
import { ApiError } from '../api';
import { handover } from '../fixtures';
import { PlatformProvider, type Platform } from '../platform';
import { useState } from 'react';
import type { Handover } from '../../../src/types';
import { Inventory } from './Inventory';

// Inventory is controlled; this holds the handover the way EditorHandover does.
const Harness = ({ initial, autoBuild }: { initial: Handover; autoBuild: boolean }) => {
  const [h, setH] = useState(initial);
  return <Inventory handover={h} onChange={setH} autoBuild={autoBuild} />;
};

afterEach(cleanup);

const setup = (api: Partial<Api> = {}, initial = handover(), autoBuild = false, graph = vi.fn()) => {
  const platform: Platform = {
    api: { listHandovers: vi.fn(), getHandover: vi.fn(), saveInventory: vi.fn(), setOwner: vi.fn(), ...api } as Api,
    invokeRaw: vi.fn(),
    searchPeople: vi.fn(),
    graph,
    navigate: vi.fn(),
    openUrl: vi.fn(),
    now: () => new Date('2026-11-23T00:00:00Z'),
  };
  render(
    <PlatformProvider value={platform}>
      <Harness initial={initial} autoBuild={autoBuild} />
    </PlatformProvider>,
  );
  return platform;
};

describe('Inventory', () => {
  test('shows the riskiest item’s breakdown first', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Why it scores 75' })).toBeTruthy();
    expect(screen.getByText('+40')).toBeTruthy();
    expect(screen.getByText('“Which decline codes does the backoff skip?”')).toBeTruthy();
  });

  test('selecting another item shows its detail', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Payment retry service runbook/ }));
    expect(screen.getByRole('heading', { name: 'Why it scores 55' })).toBeTruthy();
    expect(screen.getByText('Baton found nobody well placed. Pick someone below.')).toBeTruthy();
  });

  test('arrow keys move the selection', () => {
    setup();
    fireEvent.keyDown(screen.getByRole('navigation', { name: 'Items' }), { key: 'ArrowDown' });
    expect(screen.getByRole('heading', { name: 'Why it scores 55' })).toBeTruthy();
  });

  test('picking a suggested owner saves it', async () => {
    const saved = handover();
    saved.items[0]!.acceptedOwnerAccountId = 'lin';
    const p = setup({ setOwner: vi.fn().mockResolvedValue(saved) });
    fireEvent.click(screen.getByRole('radio', { name: /Lin Chen/ }));
    await waitFor(() => expect(p.api.setOwner).toHaveBeenCalledWith('h1', 'ari:cloud:jira:site:issue/1', 'lin'));
    await waitFor(() => expect((screen.getByRole('radio', { name: /Lin Chen/ }) as HTMLInputElement).checked).toBe(true));
  });

  test('a failed save shows the error and keeps the screen working', async () => {
    setup({ setOwner: vi.fn().mockRejectedValue(new ApiError('conflict', 'This handover is already published')) });
    fireEvent.click(screen.getByRole('radio', { name: /Arjun Rao/ }));
    expect(await screen.findByText('This handover is already published')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Why it scores 75' })).toBeTruthy();
  });

  test('item titles open outside the iframe', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('link', { name: 'Payment retry: exponential backoff for card declines' }));
    expect(p.openUrl).toHaveBeenCalledWith('https://northwind.atlassian.net/browse/PAY-1');
  });

  test('right after New handover, an empty handover starts reading the graph by itself', async () => {
    const graph = vi.fn().mockResolvedValue({ data: null });
    const saveInventory = vi.fn().mockResolvedValue(handover());
    setup({ saveInventory }, handover({ items: [] }), true, graph);
    await waitFor(() => expect(saveInventory).toHaveBeenCalledWith(expect.objectContaining({ id: 'h1', items: [] })));
    expect(graph).toHaveBeenCalled();
  });

  test('an empty handover opened later waits for the button', () => {
    const graph = vi.fn();
    setup({}, handover({ items: [] }), false, graph);
    expect(screen.getByRole('button', { name: 'Build inventory' })).toBeTruthy();
    expect(graph).not.toHaveBeenCalled();
  });
});
