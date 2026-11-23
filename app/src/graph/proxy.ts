// Runs Baton's graph queries from the backend instead of the browser.
//
// From the app page, @forge/bridge's requestTeamworkGraph gets "teamsV2 status code is: 403" on every
// team node. The same query through the backend, api.asUser().requestTeamworkGraph, returns the teams
// (tested on the demo site, Nov 23). So the UI sends graph reads to the `graphQuery` resolver.
//
// The resolver never takes query text from the browser: it takes an operation name from Q
// (queries.ts) and runs that exact query, as the signed-in user, so it can't be used to run anything
// else. Saved (persisted) queries may only use Baton's own keys.
import { Q } from './queries';
import { PQ_PAGE_INBOUND_REFS, PQ_USER_OWNED_PAGES } from './queryKeys';
import type { GraphRequest, GraphResponse } from './runner';

export type GraphOperation = keyof typeof Q;

const KNOWN_QUERY_KEYS = new Set([PQ_USER_OWNED_PAGES, PQ_PAGE_INBOUND_REFS]);
const MAX_VARIABLES_JSON = 2000;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

/** Turns a resolver payload into the exact query to run. Throws Error with a user-safe message. */
export const resolveGraphCall = (payload: unknown): { query: string; variables: Record<string, unknown> } => {
  if (!isPlainObject(payload)) throw new Error('expected { operation, variables }');
  const { operation, variables = {} } = payload as { operation?: unknown; variables?: unknown };
  if (typeof operation !== 'string' || !Object.prototype.hasOwnProperty.call(Q, operation)) {
    throw new Error(`unknown graph operation: ${String(operation)}`);
  }
  if (!isPlainObject(variables)) throw new Error('variables must be an object');
  if (JSON.stringify(variables).length > MAX_VARIABLES_JSON) throw new Error('variables are too large');
  if ('queryKey' in variables && !KNOWN_QUERY_KEYS.has(variables.queryKey as string)) {
    throw new Error('unknown saved query key');
  }
  return { query: Q[operation as GraphOperation], variables };
};

type Invoke = (name: string, payload: Record<string, unknown>) => Promise<any>;

/**
 * A GraphRequest for buildInventory that sends every query through the `graphQuery` resolver.
 * In the UI: `buildInventory({ request: backendGraphRequest(invoke), … })` with invoke from @forge/bridge.
 */
export const backendGraphRequest =
  (invoke: Invoke): GraphRequest =>
  async (query, variables) => {
    const operation = (Object.keys(Q) as GraphOperation[]).find((k) => Q[k] === query);
    if (!operation) throw new Error('Not one of Baton\'s graph queries');
    const res = await invoke('graphQuery', { operation, variables });
    if (!res?.ok) throw new Error(res?.error?.message ?? 'Graph query failed');
    return res.data as GraphResponse;
  };
