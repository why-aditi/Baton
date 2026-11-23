import { describe, expect, test } from 'vitest';
import { backendGraphRequest, resolveGraphCall } from '../src/graph/proxy';
import { Q } from '../src/graph/queries';
import { PQ_USER_OWNED_PAGES } from '../src/graph/queryKeys';

describe('resolveGraphCall', () => {
  test("runs Baton's own query for the operation name, never text from the browser", () => {
    const vars = { userId: 'ari:cloud:identity::user/m' };
    expect(resolveGraphCall({ operation: 'userTeams', variables: vars })).toEqual({ query: Q.userTeams, variables: vars });
  });

  test('rejects unknown operations, including inherited names', () => {
    expect(() => resolveGraphCall({ operation: 'deleteEverything' })).toThrow(/unknown graph operation/);
    expect(() => resolveGraphCall({ operation: 'toString' })).toThrow(/unknown graph operation/);
    expect(() => resolveGraphCall({ query: '{ __schema { types { name } } }' })).toThrow(/unknown graph operation/);
    expect(() => resolveGraphCall(null)).toThrow();
  });

  test("saved queries only run with Baton's own keys", () => {
    expect(resolveGraphCall({ operation: 'ownedPages', variables: { queryKey: PQ_USER_OWNED_PAGES, queryParams: {} } }).query).toBe(Q.ownedPages);
    expect(() => resolveGraphCall({ operation: 'ownedPages', variables: { queryKey: 'someone-elses-key' } })).toThrow(/saved query key/);
  });

  test('rejects odd or oversized variables', () => {
    expect(() => resolveGraphCall({ operation: 'userTeams', variables: ['x'] })).toThrow(/object/);
    expect(() => resolveGraphCall({ operation: 'userTeams', variables: { userId: 'x'.repeat(3000) } })).toThrow(/too large/);
  });
});

describe('backendGraphRequest', () => {
  test('sends the operation name, not the query, and unwraps the resolver reply', async () => {
    const calls: unknown[] = [];
    const request = backendGraphRequest(async (name, payload) => {
      calls.push([name, payload]);
      return { ok: true, data: { data: { atlassianUserInTeams: { edges: [] } } } };
    });
    const res = await request(Q.userTeams, { userId: 'u' });
    expect(calls).toEqual([['graphQuery', { operation: 'userTeams', variables: { userId: 'u' } }]]);
    expect(res).toEqual({ data: { atlassianUserInTeams: { edges: [] } } });
  });

  test('refuses queries that are not in Q, and surfaces resolver errors', async () => {
    const request = backendGraphRequest(async () => ({ ok: false, error: { code: 'bad_input', message: 'nope' } }));
    await expect(request('query x { y }', {})).rejects.toThrow(/Not one of Baton/);
    await expect(request(Q.userTeams, {})).rejects.toThrow('nope');
  });
});
