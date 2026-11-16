// Runs one Teamwork Graph connection query to the end, from the frontend (requestTeamworkGraph runs
// as the signed-in user). Knows nothing about node fields; normalizers handle those.

export type GraphResponse = { data?: any; errors?: { message?: string; extensions?: { code?: string } }[] };
export type GraphRequest = (query: string, variables: Record<string, unknown>) => Promise<GraphResponse>;

export type RunResult = {
  nodes: unknown[];
  /** Null edges or nodes: rows the caller can't read, or data hidden by a missing scope. */
  dropped: number;
  /** Error codes, or messages when there is no code. */
  errors: string[];
  pages: number;
  /** True when maxPages was hit and more results exist. */
  truncated: boolean;
};

const QUERY_NOT_FOUND = 'QUERY_NOT_FOUND';
const NOT_FOUND_RETRIES = 3;
const NOT_FOUND_WAIT_MS = 20_000; // new persisted queries take about a minute to propagate

/**
 * The query must take an `$after: String` variable and pass it as `after:` (the spec budgets about
 * 10 pages of 25 per person). The connection is the first field under `data`.
 */
export const runPaged = async (opts: {
  request: GraphRequest;
  query: string;
  variables: Record<string, unknown>;
  maxPages?: number;
  sleep?: (ms: number) => Promise<void>;
  onPage?: (nodesSoFar: number) => void;
}): Promise<RunResult> => {
  const { request, query, maxPages = 10 } = opts;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const out: RunResult = { nodes: [], dropped: 0, errors: [], pages: 0, truncated: false };
  let after: string | undefined;
  let notFoundRetries = 0;

  while (out.pages < maxPages) {
    let res: GraphResponse;
    try {
      res = await request(query, after ? { ...opts.variables, after } : opts.variables);
    } catch (e) {
      out.errors.push(e instanceof Error ? e.message : String(e));
      break;
    }

    const codes = (res.errors ?? []).map((e) => e.extensions?.code ?? e.message ?? 'unknown error');
    if (codes.includes(QUERY_NOT_FOUND) && notFoundRetries < NOT_FOUND_RETRIES) {
      notFoundRetries++;
      await sleep(NOT_FOUND_WAIT_MS);
      continue;
    }
    for (const c of codes) if (!out.errors.includes(c)) out.errors.push(c);

    const conn = res.data && Object.values(res.data)[0];
    if (!conn || typeof conn !== 'object') break;
    out.pages++;
    for (const edge of (conn as any).edges ?? []) {
      if (edge?.node) out.nodes.push(edge.node);
      else out.dropped++;
    }
    opts.onPage?.(out.nodes.length);

    const { hasNextPage, endCursor } = (conn as any).pageInfo ?? {};
    if (!hasNextPage || !endCursor) return out;
    after = endCursor;
  }
  out.truncated = out.pages >= maxPages;
  return out;
};
