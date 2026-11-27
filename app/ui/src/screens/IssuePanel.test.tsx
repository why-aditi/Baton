import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ApiError, type Api, type IssueHandover } from '../api';
import { PlatformProvider, type Platform } from '../platform';
import { IssuePanel } from './IssuePanel';

afterEach(cleanup);

const match = (over: Partial<IssueHandover> = {}): IssueHandover => ({
  handoverId: 'h1',
  subjectName: 'Meera Iyer',
  reason: 'leaving',
  lastDay: '2026-12-30',
  status: 'ready',
  risk: 60,
  band: 'high',
  reasons: ['Only Meera Iyer has worked on this', 'Work is mid-flight'],
  newOwner: { accountId: 'arjun', name: 'Arjun Rao' },
  ownerStatus: 'accepted',
  link: 'https://site/jira/apps/a/e/handover/h1',
  ...over,
});

const mount = (issueHandovers: () => Promise<IssueHandover[]>) => {
  const openUrl = vi.fn();
  const calls: unknown[] = [];
  const platform = {
    api: {
      issueHandovers: (q: unknown) => {
        calls.push(q);
        return issueHandovers();
      },
    } as unknown as Api,
    openUrl,
  } as unknown as Platform;
  render(
    <PlatformProvider value={platform}>
      <IssuePanel issueId="42" issueKey="PAY-1" />
    </PlatformProvider>,
  );
  return { openUrl, calls };
};

test('asks for the issue by ID and key', async () => {
  const { calls } = mount(async () => []);
  await screen.findByText(/isn’t in a handover/);
  expect(calls).toEqual([{ issueId: '42', issueKey: 'PAY-1' }]);
});

test('shows whose handover it is in, the risk and why, and the accepted owner', async () => {
  mount(async () => [match()]);
  expect(await screen.findByText('In Meera Iyer’s handover')).toBeTruthy();
  expect(screen.getByText('High risk')).toBeTruthy();
  expect(screen.getByText(/Leaving · last day Dec 30/)).toBeTruthy();
  expect(screen.getByText('Only Meera Iyer has worked on this')).toBeTruthy();
  expect(screen.getByText('Work is mid-flight')).toBeTruthy();
  expect(screen.getByText(/New owner: Arjun Rao/)).toBeTruthy();
});

test('a suggested owner is marked as not confirmed', async () => {
  mount(async () => [match({ ownerStatus: 'suggested' })]);
  expect(await screen.findByText(/Suggested owner: Arjun Rao \(not confirmed yet\)/)).toBeTruthy();
});

test('no owner yet says so', async () => {
  mount(async () => [match({ newOwner: null, ownerStatus: 'none' })]);
  expect(await screen.findByText('No new owner yet')).toBeTruthy();
});

test('opens the handover', async () => {
  const { openUrl } = mount(async () => [match()]);
  fireEvent.click(await screen.findByRole('button', { name: 'Open handover' }));
  expect(openUrl).toHaveBeenCalledWith('https://site/jira/apps/a/e/handover/h1');
});

test('lists every handover the issue is in', async () => {
  mount(async () => [match(), match({ handoverId: 'h2', subjectName: 'Arjun Rao', reason: 'leave' })]);
  expect(await screen.findByText('In Meera Iyer’s handover')).toBeTruthy();
  expect(screen.getByText('In Arjun Rao’s handover')).toBeTruthy();
});

test('an issue in no handover says so plainly', async () => {
  mount(async () => []);
  expect(await screen.findByText('This issue isn’t in a handover you can see.')).toBeTruthy();
});

test('an error shows the error banner', async () => {
  mount(async () => {
    throw new ApiError('internal', 'Something broke');
  });
  expect(await screen.findByText('Something broke')).toBeTruthy();
});
