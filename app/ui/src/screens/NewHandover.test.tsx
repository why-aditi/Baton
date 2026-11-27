import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiError, type Api } from '../api';
import { handover } from '../fixtures';
import { validate, toPayload, type NewHandoverValues } from '../newHandover';
import { PlatformProvider, type Platform } from '../platform';
import { NewHandover } from './NewHandover';

afterEach(cleanup);

const meera = { accountId: 'meera', name: 'Meera Iyer' };
const arjun = { accountId: 'arjun', name: 'Arjun Rao' };
const values = (over: Partial<NewHandoverValues> = {}): NewHandoverValues => ({
  person: meera,
  reason: 'leaving',
  lastDay: '2026-12-20',
  recipient: null,
  ...over,
});

describe('validate', () => {
  test('a complete form has no errors', () => {
    expect(validate(values(), '2026-11-23')).toEqual({});
    expect(validate(values({ lastDay: '2026-11-23' }), '2026-11-23')).toEqual({});
  });

  test('person and last day are required', () => {
    expect(Object.keys(validate(values({ person: null, lastDay: '' }), '2026-11-23'))).toEqual(['person', 'lastDay']);
  });

  test('the last day can’t be in the past or malformed', () => {
    expect(validate(values({ lastDay: '2026-11-22' }), '2026-11-23').lastDay).toMatch(/past/);
    expect(validate(values({ lastDay: '20/12/2026' }), '2026-11-23').lastDay).toMatch(/YYYY-MM-DD/);
  });

  test('the person leaving can’t also be the recipient', () => {
    expect(validate(values({ recipient: meera }), '2026-11-23').recipient).toBeTruthy();
  });

  test('toPayload matches createHandover', () => {
    expect(toPayload(values({ recipient: arjun, reason: 'team_change' }))).toEqual({
      subjectAccountId: 'meera',
      subjectName: 'Meera Iyer',
      reason: 'team_change',
      lastDay: '2026-12-20',
      recipientAccountIds: ['arjun'],
    });
  });
});

const setup = (createHandover = vi.fn().mockResolvedValue(handover()), initial?: Partial<NewHandoverValues>) => {
  const platform: Platform = {
    api: { createHandover } as unknown as Api,
    listSpaces: vi.fn().mockResolvedValue([]),
    searchPeople: vi.fn().mockResolvedValue([meera, arjun]),
    graph: vi.fn(),
    navigate: vi.fn(),
    openUrl: vi.fn(),
    now: () => new Date('2026-11-23T10:00:00Z'),
  };
  render(
    <PlatformProvider value={platform}>
      <NewHandover initial={initial} />
    </PlatformProvider>,
  );
  return platform;
};

describe('NewHandover', () => {
  test('submitting an empty form shows both errors and calls nothing', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Build inventory' }));
    expect(screen.getByText('Choose the person whose work is being handed over.')).toBeTruthy();
    expect(screen.getByText('Choose their last day.')).toBeTruthy();
    expect(p.api.createHandover).not.toHaveBeenCalled();
  });

  test('a valid form creates the handover and opens it with the build started', async () => {
    const p = setup(undefined, { person: meera, lastDay: '2026-12-20' });
    fireEvent.click(screen.getByRole('radio', { name: 'Changing teams' }));
    expect(screen.getByText('Last day on the team')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Build inventory' }));
    await waitFor(() => expect(p.navigate).toHaveBeenCalledWith({ name: 'handover', id: 'h1', build: true }));
    expect(p.api.createHandover).toHaveBeenCalledWith(expect.objectContaining({ subjectAccountId: 'meera', reason: 'team_change' }));
  });

  test('starting your own handover shows the refusal under the person field', async () => {
    const refuse = vi.fn().mockRejectedValue(new ApiError('bad_input', 'Someone else, usually your manager, has to start your handover'));
    setup(refuse, { person: meera, lastDay: '2026-12-20' });
    fireEvent.click(screen.getByRole('button', { name: 'Build inventory' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Someone else, usually your manager, has to start your handover');
  });

  test('other failures show a banner and let you try again', async () => {
    setup(vi.fn().mockRejectedValue(new ApiError('internal', 'Storage is unavailable')), { person: meera, lastDay: '2026-12-20' });
    fireEvent.click(screen.getByRole('button', { name: 'Build inventory' }));
    expect(await screen.findByText('Storage is unavailable')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Build inventory' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
