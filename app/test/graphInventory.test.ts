import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { buildInventory } from '../src/graph/inventory';
import type { GraphRequest, GraphResponse } from '../src/graph/runner';

const fixture = (name: string): GraphResponse =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')).response;

const MEERA = 'ari:cloud:identity::user/712020:00000000-0000-4000-8000-00000000me01';
// PAY-1: assigned to and reported by Meera in the seed.
const ISSUE = 'ari:cloud:jira:7251940d-1e14-4314-b9e9-647e62148c96:issue/66433';
const PAY7 = 'ari:cloud:jira:7251940d-1e14-4314-b9e9-647e62148c96:issue/66439';
const ARJUN = 'ari:cloud:identity::user/712020:956daaf1-70f4-44ef-92b1-92169450c4da';
const PAGE = 'ari:cloud:confluence:7251940d-1e14-4314-b9e9-647e62148c96:page/2719746';

const BY_OPERATION: Record<string, string> = {
  baton_assignedWork: 'assignedJira',
  baton_reportedWork: 'reportedJira',
  baton_pullRequests: 'pullRequests',
  baton_ownedPages: 'ownedPages',
  baton_goalsAndProjects: 'goalsAndProjects',
  baton_userTeams: 'userTeams',
  baton_teamMembers: 'teamMembers',
  baton_pageContributors: 'pageContributors',
  baton_workItemComments: 'workItemComments',
  baton_openAssigned: 'assignedJira',
  baton_issuePullRequests: 'issuePullRequests',
};

/** Answers from the fixtures by operation name; later pages come back empty. Overrides win. */
const fakeGraph = (overrides: Record<string, (vars: Record<string, unknown>) => GraphResponse | Promise<GraphResponse>> = {}) => {
  const calls: { op: string; vars: Record<string, unknown> }[] = [];
  const request: GraphRequest = async (query, vars) => {
    const op = query.match(/query (\w+)/)![1]!;
    calls.push({ op, vars });
    if (overrides[op]) return overrides[op]!(vars);
    const res = fixture(BY_OPERATION[op]!);
    if (!vars.after) return res;
    const field = Object.keys(res.data)[0]!;
    return { data: { [field]: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } } } };
  };
  return { request, calls };
};

const run = (request: GraphRequest, extra = {}) =>
  buildInventory({ request, subjectAri: MEERA, ownedPagesQueryKey: 'pq-key', sleep: async () => {}, ...extra });

describe('buildInventory', () => {
  test('merges every source, one item per ARI', async () => {
    const { request } = fakeGraph();
    const inv = await run(request);
    expect(inv.items.filter((i) => i.ari === ISSUE)).toEqual([
      expect.objectContaining({ key: 'PAY-1', subjectRole: 'assignee' }),
    ]);
    expect(inv.items.filter((i) => i.ari === PAGE)).toHaveLength(1);
    expect(inv.items.filter((i) => i.kind === 'goal')).toHaveLength(1);
    // 14 assigned issues (the 7 she reported are among them), 1 page, 1 goal.
    expect(inv.items).toHaveLength(16);
  });

  test('passes the subject, the persisted query key and the PR window', async () => {
    const { request, calls } = fakeGraph();
    await run(request);
    expect(calls.find((c) => c.op === 'baton_ownedPages')?.vars).toEqual({
      queryKey: 'pq-key',
      queryParams: { userId: MEERA },
    });
    expect(calls.find((c) => c.op === 'baton_assignedWork')?.vars).toEqual({ userId: MEERA });
  });

  test("loads each team's members, as user ARIs", async () => {
    const { request, calls } = fakeGraph();
    const inv = await run(request);
    expect(calls.filter((c) => c.op === 'baton_teamMembers')).toHaveLength(2);
    expect(inv.teams.map((t) => t.name)).toEqual(['Platform', 'Payments']);
    expect(inv.teams[1]?.members).toHaveLength(5);
    expect(inv.teams[1]?.members).toContain(MEERA);
  });

  test('loads members for at most 10 teams', async () => {
    const many = Array.from({ length: 12 }, (_, n) => ({ node: { __typename: 'AtlassianTeam', id: `ari:cloud:identity::team/t${n}`, displayName: `T${n}` } }));
    const { request, calls } = fakeGraph({
      baton_userTeams: () => ({ data: { atlassianUserInTeams: { edges: many, pageInfo: { hasNextPage: false } } } }),
    });
    const inv = await run(request);
    expect(calls.filter((c) => c.op === 'baton_teamMembers')).toHaveLength(10);
    expect(inv.teams).toHaveLength(10);
  });

  test('collects display names by account ID', async () => {
    const { request } = fakeGraph();
    const inv = await run(request);
    expect(inv.people).toMatchObject({
      '712020:00000000-0000-4000-8000-00000000me01': 'Meera Iyer',
      '712020:c29f7e54-6c0b-4b0a-8fb4-fde14d848855': 'Priya Nair',
    });
  });

  test('adds page contributors and issue commenters as collaborators', async () => {
    const { request } = fakeGraph({
      baton_pageContributors: () => ({
        data: {
          confluencePageContributors: {
            edges: [{ node: { __typename: 'AtlassianUser', id: 'ari:cloud:identity::user/lin', name: 'Lin' } }],
            pageInfo: { hasNextPage: false },
          },
        },
      }),
      baton_workItemComments: () => ({
        data: {
          jiraWorkItemComments: {
            edges: [
              { node: { __typename: 'JiraWorkItemComment', id: 'c1', deleted: false, author: { id: 'ari:cloud:identity::user/arjun', name: 'Arjun' } } },
              { node: { __typename: 'JiraWorkItemComment', id: 'c2', deleted: true, author: { id: 'ari:cloud:identity::user/gone', name: 'Gone' } } },
            ],
            pageInfo: { hasNextPage: false },
          },
        },
      }),
    });
    const inv = await run(request);
    expect(inv.items.find((i) => i.ari === PAGE)?.collaborators).toEqual([MEERA, 'ari:cloud:identity::user/lin']);
    expect(inv.items.find((i) => i.ari === ISSUE)?.collaborators).toEqual([MEERA, 'ari:cloud:identity::user/arjun']);
    expect(inv.people.arjun).toBe('Arjun');
  });

  test('counts open assigned items for owner candidates, not the subject', async () => {
    const { request, calls } = fakeGraph();
    const inv = await run(request);
    // The fake answers every workload lookup with Meera's 14 recorded open issues.
    expect(inv.openAssigned).toMatchObject({ [ARJUN]: 14 });
    expect(inv.openAssigned).not.toHaveProperty(MEERA);
    const counted = calls.filter((c) => c.op === 'baton_openAssigned').map((c) => c.vars.userId);
    expect(counted).not.toContain(MEERA);
    expect(new Set(counted).size).toBe(counted.length);
  });

  test('caps workload lookups at 25 candidates', async () => {
    const many = Array.from({ length: 40 }, (_, n) => ({
      node: { __typename: 'AtlassianUser', id: `ari:cloud:identity::user/u${n}`, name: `U${n}` },
    }));
    const { request, calls } = fakeGraph({
      baton_teamMembers: () => ({ data: { atlassianTeamMembers: { edges: many, pageInfo: { hasNextPage: false } } } }),
    });
    await run(request);
    expect(calls.filter((c) => c.op === 'baton_openAssigned')).toHaveLength(25);
  });

  test('flags empty sources with the scope to check', async () => {
    const { request } = fakeGraph();
    const inv = await run(request);
    expect(inv.warnings).toContainEqual({
      source: 'pullRequests',
      level: 'info',
      message:
        'No pull requests found. If you expected some, check that the read:graph:pull-request:external scope is granted.',
    });
  });

  test('one failing source does not stop the others', async () => {
    const { request } = fakeGraph({
      baton_assignedWork: () => {
        throw new Error('network down');
      },
    });
    const inv = await run(request);
    expect(inv.warnings).toContainEqual(expect.objectContaining({ source: 'assignedJira', level: 'error' }));
    expect(inv.items.find((i) => i.ari === ISSUE)).toMatchObject({ subjectRole: 'reporter' });
  });

  test('the known teams 403 gives no teams and one plain note, not an error', async () => {
    const { request } = fakeGraph({ baton_userTeams: () => fixture('userTeams.app-403') });
    const inv = await run(request);
    expect(inv.teams).toEqual([]);
    expect(inv.warnings.filter((w) => w.source === 'teams')).toEqual([
      {
        source: 'teams',
        level: 'info',
        message: "Teams aren't available yet because of a known Atlassian issue, so owner suggestions are based on who worked on each item.",
      },
    ]);
  });

  test('other team errors are still reported as errors', async () => {
    const { request } = fakeGraph({
      baton_userTeams: () => ({ data: null, errors: [{ message: 'nope', extensions: { code: 'FORBIDDEN' } }] }),
    });
    const inv = await run(request);
    expect(inv.warnings).toContainEqual(expect.objectContaining({ source: 'teams', level: 'error' }));
  });

  test('reports progress per source', async () => {
    const { request } = fakeGraph();
    const seen = new Set<string>();
    await run(request, { onProgress: (p: { source: string }) => seen.add(p.source) });
    expect(seen).toEqual(new Set(['assignedJira', 'reportedJira', 'pullRequests', 'pages', 'goalsAndProjects', 'teams', 'details']));
  });

  test('counts distinct pages linking to each page, from the recorded response', async () => {
    const recorded = fixture('pageInboundRefs');
    const edges = (recorded.data as any).customQuery.edges;
    const self = { node: { columns: [{ key: 'src', value: { id: PAGE } }] } };
    const { request, calls } = fakeGraph({
      // The recorded three, one of them twice, plus the page itself: still 3.
      baton_pageInboundRefs: () => ({ data: { customQuery: { edges: [...edges, edges[0], self], pageInfo: { hasNextPage: false } } } }),
    });
    const inv = await run(request, { pageLinksQueryKey: 'links-key' });
    expect(inv.items.find((i) => i.ari === PAGE)?.inboundLinks).toBe(3);
    expect(calls.find((c) => c.op === 'baton_pageInboundRefs')?.vars).toEqual({
      queryKey: 'links-key',
      queryParams: { pageId: PAGE },
    });
  });

  test('without a links query key, pages get no link count', async () => {
    const { request, calls } = fakeGraph();
    const inv = await run(request);
    expect(calls.some((c) => c.op === 'baton_pageInboundRefs')).toBe(false);
    expect(inv.items.find((i) => i.ari === PAGE)?.inboundLinks).toBeUndefined();
  });

  test("finds Bitbucket PRs through the subject's Jira issues when given their name", async () => {
    // As recorded on the seed: PAY-7 links Arjun's PR that Meera reviews, every name null. PAY-1 gets
    // a PR by Meera (same third-party ID as the recorded reviewer), so her ID can be inferred.
    const recorded = fixture('issuePullRequests');
    const [edge] = (recorded.data as any).jiraWorkItemLinkedExternalPullRequests.edges;
    const meeraTp = edge.node.reviewers[0].user.id;
    const hers = { node: { ...edge.node, id: 'pr-hers', url: 'https://bitbucket.org/x/pull-requests/1', title: 'PAY-1 Add jittered backoff', author: { id: meeraTp, name: null }, reviewers: [] } };
    const prs = (edges: unknown[]) => ({ data: { jiraWorkItemLinkedExternalPullRequests: { edges, pageInfo: { hasNextPage: false } } } });
    const { request, calls } = fakeGraph({
      baton_issuePullRequests: (vars) => (vars.id === PAY7 ? recorded : vars.id === ISSUE ? prs([hers]) : prs([])),
    });
    const inv = await run(request, { subjectName: 'Meera Iyer' });
    expect(calls.filter((c) => c.op === 'baton_issuePullRequests').map((c) => c.vars.id)).toContain(ISSUE);
    expect(inv.items.filter((i) => i.kind === 'pull_request')).toEqual([
      expect.objectContaining({ title: 'PAY-1 Add jittered backoff', subjectRole: 'author' }),
      expect.objectContaining({ title: 'PAY-7 Idempotency keys for settlement captures', subjectRole: 'reviewer', reviewers: [MEERA] }),
    ]);
    // The person-level PR query found nothing, but this route did: no "no pull requests" warning.
    expect(inv.warnings.some((w) => w.source === 'pullRequests')).toBe(false);
  });

  test("without the subject's name, PRs aren't looked up per issue", async () => {
    const { request, calls } = fakeGraph();
    const inv = await run(request);
    expect(calls.some((c) => c.op === 'baton_issuePullRequests')).toBe(false);
    expect(inv.items.some((i) => i.kind === 'pull_request')).toBe(false);
  });
});
