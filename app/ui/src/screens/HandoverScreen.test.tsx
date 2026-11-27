import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ApiError, type Api } from '../api';
import { PlatformProvider, type Platform } from '../platform';
import { HandoverScreen } from './HandoverScreen';

afterEach(cleanup);

test('a handover that fails to load offers a retry and a way back to the list', async () => {
  const getHandover = vi.fn().mockRejectedValue(new ApiError('internal', 'Storage is unavailable right now.'));
  const platform = {
    api: { getHandover } as unknown as Api,
    navigate: vi.fn(),
  } as unknown as Platform;
  render(
    <PlatformProvider value={platform}>
      <HandoverScreen id="h1" />
    </PlatformProvider>,
  );
  expect(await screen.findByText('Storage is unavailable right now.')).toBeTruthy();
  fireEvent.click(screen.getByRole('link', { name: 'Back to handovers' }));
  expect(platform.navigate).toHaveBeenCalledWith({ name: 'list' });
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
});
