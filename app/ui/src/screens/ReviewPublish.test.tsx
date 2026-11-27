import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Handover, HandoverSummary } from '../../../src/types';
import { ApiError, type Api } from '../api';
import { handover } from '../fixtures';
import { PlatformProvider, type Platform } from '../platform';
import { changeLabel, fromSummaryDraft, readiness, reassignable, summaryDirty, toSummaryDraft } from '../review';
import { ReviewPublish } from './ReviewPublish';

afterEach(cleanup);

const summary: HandoverSummary = {
  overview: 'Meera owned the payment-retry service. Arjun takes the retry logic.',
  risks: ['The backoff skips hard declines on purpose'],
  sections: [{ ownerAccountId: 'arjun', body: 'PAY-1 is half done.', itemAris: ['ari:cloud:jira:site:issue/1'] }],
};

/** A handover ready to publish: PAY-1 has Arjun confirmed, the question is answered, a summary exists. */
const readyHandover = (over: Partial<Handover> = {}) => {
  const h = handover({ status: 'ready', summary, ...over });
  h.items[0]!.acceptedOwnerAccountId = 'arjun';
  h.questions[0]!.answer = 'Hard declines, on purpose.';
  return h;
};

const setup = (h: Handover, api: Partial<Api> = {}) => {
  const platform: Platform = {
    api: api as Api,
    listSpaces: vi.fn().mockResolvedValue([{ key: 'NWP', name: 'Northwind Pay' }]),
    searchPeople: vi.fn(),
    graph: vi.fn(),
    navigate: vi.fn(),
    openUrl: vi.fn(),
    now: () => new Date('2026-11-23T00:00:00Z'),
  };
  const onChange = vi.fn();
  const onShowTab = vi.fn();
  render(
    <PlatformProvider value={platform}>
      <ReviewPublish handover={h} onChange={onChange} onShowTab={onShowTab} />
    </PlatformProvider>,
  );
  return { platform, onChange, onShowTab };
};

const chooseSpace = async () => {
  const input = screen.getByLabelText('Space');
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.click(await screen.findByText('Northwind Pay (NWP)'));
};

describe('review helpers', () => {
  test('only Jira issues with a confirmed owner can be reassigned', () => {
    expect(reassignable(handover()).map((i) => i.key)).toEqual([]);
    expect(reassignable(readyHandover()).map((i) => i.key)).toEqual(['PAY-1']);
  });

  test('readiness counts owners, answers and the summary', () => {
    expect(readiness(readyHandover())).toMatchObject({ hasSummary: true, answered: 1, questions: 1, confirmedOwners: 1, items: 2, highWithoutOwner: [] });
    expect(readiness(handover()).highWithoutOwner.map((i) => i.key)).toEqual(['PAY-1']);
  });

  test('the change names the person leaving only when they are the assignee', () => {
    const [pay1] = readyHandover().items;
    expect(changeLabel(pay1!, 'Meera Iyer', 'Arjun Rao')).toBe('Meera Iyer → Arjun Rao');
    expect(changeLabel({ ...pay1!, subjectRole: 'reporter' }, 'Meera Iyer', 'Arjun Rao')).toBe('New assignee: Arjun Rao');
  });

  test('risks edit as lines, and bullets typed by hand are stripped', () => {
    const d = toSummaryDraft(summary);
    expect(d.risks).toBe('The backoff skips hard declines on purpose');
    expect(fromSummaryDraft({ ...d, risks: '- one\n\n• two  ' }).risks).toEqual(['one', 'two']);
    expect(summaryDirty(d, summary)).toBe(false);
    expect(summaryDirty({ ...d, overview: 'x' }, summary)).toBe(true);
  });
});

describe('ReviewPublish', () => {
  test('without a summary, Baton writes one', async () => {
    const generateSummary = vi.fn().mockResolvedValue(readyHandover());
    const { onChange } = setup(handover({ status: 'ready' }), { generateSummary });
    fireEvent.click(screen.getByRole('button', { name: 'Generate handover' }));
    expect(await screen.findByDisplayValue(summary.overview)).toBeTruthy();
    expect(generateSummary).toHaveBeenCalledWith('h1', false);
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByLabelText('For Arjun Rao')).toBeTruthy();
  });

  test('when the LLM is down, you can write the summary yourself', async () => {
    setup(handover({ status: 'ready' }), { generateSummary: vi.fn().mockRejectedValue(new ApiError('llm_unavailable', 'Could not generate the summary.')) });
    fireEvent.click(screen.getByRole('button', { name: 'Generate handover' }));
    expect(await screen.findByText('Baton couldn’t write the summary right now')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Write it myself' }));
    expect(screen.getByLabelText('Overview')).toBeTruthy();
  });

  test('the checklist warns about high-risk items with no confirmed owner', () => {
    const { onShowTab } = setup(handover({ status: 'ready', summary }));
    expect(screen.getByText('1 high-risk item has no confirmed owner')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Open Inventory' }));
    expect(onShowTab).toHaveBeenCalledWith('inventory');
  });

  test('publishing saves unsaved edits first, confirms, then shows the page link', async () => {
    const updateSummary = vi.fn().mockImplementation(async (_id, s) => readyHandover({ summary: s }));
    const published = readyHandover({ status: 'published', confluencePageUrl: 'https://northwind.atlassian.net/wiki/p/1' });
    const publishHandover = vi.fn().mockResolvedValue(published);
    const { onChange, platform } = setup(readyHandover(), { updateSummary, publishHandover });

    fireEvent.change(screen.getByLabelText('Overview'), { target: { value: 'Edited overview' } });
    const publish = screen.getByRole('button', { name: 'Publish to Confluence' }) as HTMLButtonElement;
    expect(publish.disabled).toBe(true); // no space yet
    await chooseSpace();
    fireEvent.click(publish);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Handover: Meera Iyer \(last day 2026-12-20\)/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish to Confluence' }));

    await waitFor(() => expect(publishHandover).toHaveBeenCalledWith('h1', 'NWP'));
    expect(updateSummary).toHaveBeenCalledWith('h1', expect.objectContaining({ overview: 'Edited overview' }));
    expect(updateSummary.mock.invocationCallOrder[0]!).toBeLessThan(publishHandover.mock.invocationCallOrder[0]!);
    expect(onChange).toHaveBeenLastCalledWith(published);
    expect(platform.listSpaces).toHaveBeenCalled();
  });

  test('a published handover links to its page', () => {
    const { platform } = setup(readyHandover({ status: 'published', confluencePageUrl: 'https://northwind.atlassian.net/wiki/p/1' }));
    fireEvent.click(screen.getByRole('link', { name: 'Handover: Meera Iyer (last day 2026-12-20)' }));
    expect(platform.openUrl).toHaveBeenCalledWith('https://northwind.atlassian.net/wiki/p/1');
  });

  test('reassigning lists every change first, then shows failures by row', async () => {
    const h = readyHandover();
    h.items.push({ ...h.items[0]!, ari: 'ari:cloud:jira:site:issue/4', key: 'PAY-4', title: 'Dead-letter queue replay tool', acceptedOwnerAccountId: 'dana' });
    const reassignIssues = vi.fn().mockResolvedValue({
      results: [
        { ari: 'ari:cloud:jira:site:issue/1', key: 'PAY-1', accountId: 'arjun', ok: true },
        { ari: 'ari:cloud:jira:site:issue/4', key: 'PAY-4', accountId: 'dana', ok: false, error: 'Dana Weiss can’t be assigned in PAY' },
      ],
    });
    setup(h, { reassignIssues });

    fireEvent.click(screen.getByRole('button', { name: 'Reassign 2 issues' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/: Meera Iyer → Arjun Rao/)).toBeTruthy();
    expect(within(dialog).getByText(/: Meera Iyer → Dana Weiss/)).toBeTruthy();
    expect(reassignIssues).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reassign 2 issues' }));

    expect(await screen.findByText('1 of 2 couldn’t be reassigned')).toBeTruthy();
    expect(screen.getByText('Failed: Dana Weiss can’t be assigned in PAY')).toBeTruthy();
    expect(screen.getByText('Reassigned')).toBeTruthy();
    expect(reassignIssues).toHaveBeenCalledWith('h1', ['ari:cloud:jira:site:issue/1', 'ari:cloud:jira:site:issue/4']);
  });

  test('unticking an issue leaves it out', async () => {
    const reassignIssues = vi.fn().mockResolvedValue({ results: [] });
    const h = readyHandover();
    setup(h, { reassignIssues });
    fireEvent.click(screen.getByRole('checkbox'));
    expect((screen.getByRole('button', { name: 'Reassign 0 issues' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
