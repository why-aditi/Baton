import { describe, expect, test, vi } from 'vitest';
import { ApiError, makeApi } from './api';

describe('makeApi', () => {
  test('returns data on ok and sends the payload', async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true, data: [] });
    await expect(makeApi(invoke).listHandovers()).resolves.toEqual([]);
    await makeApi(invoke).setOwner('h1', 'ari:x', null);
    expect(invoke).toHaveBeenLastCalledWith('setOwner', { id: 'h1', itemAri: 'ari:x', accountId: null });
  });

  test('throws ApiError with the resolver’s code and message', async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: false, error: { code: 'conflict', message: 'Already published' } });
    const err = await makeApi(invoke).getHandover('h1').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'conflict', message: 'Already published' });
  });

  test('an empty answer is an internal error, not a crash', async () => {
    const err = await makeApi(vi.fn().mockResolvedValue(undefined)).listHandovers().catch((e) => e);
    expect(err).toMatchObject({ code: 'internal' });
  });
});
