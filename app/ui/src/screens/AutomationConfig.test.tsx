import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { PlatformProvider, type Platform } from '../platform';
import { AutomationConfig } from './AutomationConfig';

afterEach(cleanup);

const mount = (extension: unknown = {}, opts: { submit?: (v: unknown) => Promise<void>; showDebug?: boolean } = {}) => {
  const submitConfig = vi.fn(opts.submit ?? (async () => {}));
  render(
    <PlatformProvider value={{ submitConfig } as unknown as Platform}>
      <AutomationConfig extension={extension} showDebug={opts.showDebug ?? false} />
    </PlatformProvider>,
  );
  return submitConfig;
};

const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

test('saves the values under the action’s input names', async () => {
  const submit = mount();
  type(/^Person leaving/, '{{issue.assignee.accountId}}');
  type(/^Last day/, '{{issue.duedate}}');
  type(/^Share with/, '{{issue.reporter.accountId}}');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith({
      person: '{{issue.assignee.accountId}}',
      reason: 'leaving',
      lastDay: '{{issue.duedate}}',
      recipient: '{{issue.reporter.accountId}}',
    }),
  );
});

test('prefills saved values and the chosen reason', () => {
  mount({ config: { person: 'Meera', reason: 'team_change', lastDay: '2026-12-30' } });
  expect((screen.getByLabelText(/^Person leaving/) as HTMLInputElement).value).toBe('Meera');
  expect((screen.getByLabelText('Changing teams') as HTMLInputElement).checked).toBe(true);
});

test('shows what is missing instead of saving', () => {
  const submit = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByText('Who is leaving? A name, an account ID or a smart value.')).toBeTruthy();
  expect(submit).not.toHaveBeenCalled();
});

test('a failed save says so and keeps the form', async () => {
  mount({ config: { person: 'Meera', lastDay: '2026-12-30' } }, { submit: async () => Promise.reject(new Error('nope')) });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText(/Automation didn’t accept the settings/)).toBeTruthy();
  expect((screen.getByLabelText(/^Person leaving/) as HTMLInputElement).value).toBe('Meera');
});

test('outside production, shows what Automation sent, for working out its contract', () => {
  mount({ type: 'action', config: { person: 'x' } }, { showDebug: true });
  expect(screen.getByText('What Automation sent (development only)')).toBeTruthy();
  expect(screen.getByText(/"type": "action"/)).toBeTruthy();
});

test('in production there is no debug panel', () => {
  mount({ type: 'action' }, { showDebug: false });
  expect(screen.queryByText('What Automation sent (development only)')).toBeNull();
});
