import { describe, expect, test } from 'vitest';
import { runPaged, type GraphRequest } from '../src/graph/runner';

type Page = { data?: any; errors?: any[] };

/** Answers each request from a list of pages and records the variables it was called with. */
const fake = (pages: Page[]) => {
  const calls: Record<string, unknown>[] = [];
  const request: GraphRequest = async (_q, vars) => {
    calls.push(vars);
    const p = pages.shift();
    if (!p) throw new Error('unexpected call');
    return p;
  };
  return { request, calls };
};

const conn = (nodes: unknown[], endCursor: string | null): { data: any; errors?: any[] } => ({
  data: {
    atlassianUserAssignedJiraWorkItems: {
      edges: nodes.map((node) => (node === null ? null : { node })),
      pageInfo: { hasNextPage: endCursor !== null, endCursor },
    },
  },
});

const noSleep = async () => {};

describe('runPaged', () => {
  test('follows endCursor through every page', async () => {
    const { request, calls } = fake([conn([{ id: 1 }], 'c1'), conn([{ id: 2 }], null)]);
    const r = await runPaged({ request, query: 'q', variables: { userId: 'u' }, sleep: noSleep });
    expect(r.nodes).toEqual([{ id: 1 }, { id: 2 }]);
    expect(calls).toEqual([{ userId: 'u' }, { userId: 'u', after: 'c1' }]);
    expect(r).toMatchObject({ pages: 2, truncated: false, dropped: 0, errors: [] });
  });

  test('stops at maxPages and says it was truncated', async () => {
    const { request } = fake([conn([{ id: 1 }], 'c1'), conn([{ id: 2 }], 'c2')]);
    const r = await runPaged({ request, query: 'q', variables: {}, maxPages: 2, sleep: noSleep });
    expect(r).toMatchObject({ pages: 2, truncated: true });
  });

  test('skips null edges and null nodes, counting them as dropped', async () => {
    const page = conn([{ id: 1 }, null], null);
    page.data.atlassianUserAssignedJiraWorkItems.edges.push({ node: null });
    const { request } = fake([page]);
    const r = await runPaged({ request, query: 'q', variables: {}, sleep: noSleep });
    expect(r.nodes).toEqual([{ id: 1 }]);
    expect(r.dropped).toBe(2);
  });

  test('returns error codes when data is null', async () => {
    const { request } = fake([{ data: null, errors: [{ message: 'nope', extensions: { code: 'FORBIDDEN' } }] }]);
    const r = await runPaged({ request, query: 'q', variables: {}, sleep: noSleep });
    expect(r).toMatchObject({ nodes: [], errors: ['FORBIDDEN'] });
  });

  test('falls back to the message when an error has no code', async () => {
    const { request } = fake([{ data: null, errors: [{ message: 'boom' }] }]);
    expect((await runPaged({ request, query: 'q', variables: {}, sleep: noSleep })).errors).toEqual(['boom']);
  });

  test('keeps partial data alongside errors', async () => {
    const page = { ...conn([{ id: 1 }], null), errors: [{ extensions: { code: 'teamsV2 status 403' } }] };
    const { request } = fake([page]);
    const r = await runPaged({ request, query: 'q', variables: {}, sleep: noSleep });
    expect(r).toMatchObject({ nodes: [{ id: 1 }], errors: ['teamsV2 status 403'] });
  });

  test('retries QUERY_NOT_FOUND (a new persisted query still propagating), then succeeds', async () => {
    const notFound = { data: null, errors: [{ extensions: { code: 'QUERY_NOT_FOUND' } }] };
    const waits: number[] = [];
    const { request } = fake([notFound, notFound, conn([{ id: 1 }], null)]);
    const r = await runPaged({
      request,
      query: 'q',
      variables: {},
      sleep: async (ms) => void waits.push(ms),
    });
    expect(r.nodes).toEqual([{ id: 1 }]);
    expect(waits).toEqual([20_000, 20_000]);
  });

  test('gives up on QUERY_NOT_FOUND after 3 retries', async () => {
    const notFound = { data: null, errors: [{ extensions: { code: 'QUERY_NOT_FOUND' } }] };
    const { request, calls } = fake([notFound, notFound, notFound, notFound]);
    const r = await runPaged({ request, query: 'q', variables: {}, sleep: noSleep });
    expect(r.errors).toEqual(['QUERY_NOT_FOUND']);
    expect(calls).toHaveLength(4);
  });

  test('a thrown request becomes an error, not an exception', async () => {
    const request: GraphRequest = async () => {
      throw new Error('network down');
    };
    expect((await runPaged({ request, query: 'q', variables: {}, sleep: noSleep })).errors).toEqual(['network down']);
  });

  test('reports progress after each page', async () => {
    const seen: number[] = [];
    const { request } = fake([conn([{ id: 1 }], 'c1'), conn([{ id: 2 }, { id: 3 }], null)]);
    await runPaged({ request, query: 'q', variables: {}, sleep: noSleep, onPage: (n) => seen.push(n) });
    expect(seen).toEqual([1, 3]);
  });
});
