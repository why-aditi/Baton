import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  goalsAndProjects,
  issuePullRequests,
  jiraWorkItems,
  ownedPages,
  pullRequests,
  teams,
  users,
} from '../src/graph/normalize';

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')).response;
/** The nodes runPaged would hand over: every non-null edge's node. */
const nodesOf = (name: string): unknown[] =>
  (Object.values(fixture(name).data)[0] as any).edges.filter((e: any) => e?.node).map((e: any) => e.node);

const MEERA = 'ari:cloud:identity::user/712020:00000000-0000-4000-8000-00000000me01';
const OTHER = 'ari:cloud:identity::user/other';

describe('jiraWorkItems', () => {
  test("maps the recorded assigned issues (the seed's 14 open ones for Meera)", () => {
    const { items, people } = jiraWorkItems(nodesOf('assignedJira'), MEERA, 'assignee');
    expect(items).toHaveLength(14);
    expect(items[0]).toEqual({
      ari: 'ari:cloud:jira:7251940d-1e14-4314-b9e9-647e62148c96:issue/66433',
      kind: 'jira_issue',
      title: 'Payment retry: exponential backoff for card declines',
      url: 'https://one-atlas-ubvd.atlassian.net/browse/PAY-1',
      key: 'PAY-1',
      status: 'In Progress',
      statusCategory: 'in_progress',
      dueDate: '2027-01-02',
      collaborators: [MEERA],
      subjectRole: 'assignee',
      container: 'PAY',
    });
    expect(people['712020:00000000-0000-4000-8000-00000000me01']).toBe('Meera Iyer');
    expect(people['712020:956daaf1-70f4-44ef-92b1-92169450c4da']).toBe('Arjun Rao');
  });

  const issue = (over: Record<string, unknown> = {}) => ({
    __typename: 'JiraWorkItem',
    id: 'ari:i',
    key: 'PAY-142',
    summary: 'Retry backoff',
    webUrl: 'https://x/browse/PAY-142',
    status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
    assignee: { id: MEERA, name: 'Meera Iyer' },
    reporter: { id: OTHER, name: 'Arjun Rao' },
    dueAt: null,
    resolvedAt: null,
    ...over,
  });

  test('maps status categories and the due date', () => {
    const [i] = jiraWorkItems([issue({ dueAt: '2026-11-30T00:00:00.000Z' })], MEERA, 'assignee').items;
    expect(i).toMatchObject({ statusCategory: 'in_progress', dueDate: '2026-11-30', collaborators: [MEERA, OTHER] });
  });

  test('drops done and resolved issues: the inventory is open work only', () => {
    const done = issue({ status: { name: 'Done', statusCategory: { key: 'done' } } });
    const resolved = issue({ id: 'ari:j', resolvedAt: '2026-11-01T00:00:00Z' });
    expect(jiraWorkItems([done, resolved], MEERA, 'assignee').items).toEqual([]);
  });

  test('ignores other node types and nodes without an id', () => {
    expect(jiraWorkItems([{ __typename: 'Other', id: 'x' }, issue({ id: null })], MEERA, 'assignee').items).toEqual([]);
  });

  test('falls back to the key when there is no summary', () => {
    expect(jiraWorkItems([issue({ summary: null })], MEERA, 'assignee').items[0]?.title).toBe('PAY-142');
  });
});

describe('pullRequests', () => {
  const pr = (over: Record<string, unknown> = {}) => ({
    __typename: 'ExternalPullRequest',
    id: 'ari:pr',
    displayId: '#7',
    title: 'Fix retry jitter',
    url: 'https://bitbucket.org/nw/pay/pull-requests/7',
    status: 'OPEN',
    lastUpdatedAt: '2026-11-10T00:00:00Z',
    repositoryId: 'nw/pay',
    author: { id: MEERA, name: 'Meera Iyer' },
    reviewers: [{ approvalStatus: 'UNAPPROVED', user: { id: OTHER, name: 'Arjun Rao' } }],
    ...over,
  });

  test('the recorded response is empty (Bitbucket behind an IP allowlist)', () => {
    expect(pullRequests(nodesOf('pullRequests'), MEERA).items).toEqual([]);
  });

  test('maps an open PR the subject authored', () => {
    const { items, people } = pullRequests([pr()], MEERA);
    expect(items).toEqual([
      {
        ari: 'ari:pr',
        kind: 'pull_request',
        title: 'Fix retry jitter',
        url: 'https://bitbucket.org/nw/pay/pull-requests/7',
        status: 'OPEN',
        statusCategory: 'in_progress',
        updatedAt: '2026-11-10T00:00:00Z',
        collaborators: [MEERA, OTHER],
        reviewers: [OTHER],
        subjectRole: 'author',
        container: 'nw/pay',
      },
    ]);
    expect(people).toMatchObject({ other: 'Arjun Rao' });
  });

  test('a PR someone else wrote is one the subject reviews', () => {
    const item = pullRequests([pr({ author: { id: OTHER, name: 'Arjun Rao' }, reviewers: [{ user: { id: MEERA } }] })], MEERA)
      .items[0];
    expect(item).toMatchObject({ subjectRole: 'reviewer', reviewers: [MEERA] });
  });

  test('a PR the subject neither wrote nor reviews is skipped (the query runs without roles)', () => {
    expect(pullRequests([pr({ author: { id: OTHER, name: 'Arjun Rao' }, reviewers: [] })], MEERA).items).toEqual([]);
  });

  test('drafts are mid-flight too', () => {
    expect(pullRequests([pr({ status: 'DRAFT' })], MEERA).items[0]?.statusCategory).toBe('in_progress');
  });

  test('merged and declined PRs are dropped', () => {
    expect(pullRequests([pr({ status: 'MERGED' }), pr({ id: 'b', status: 'DECLINED' })], MEERA).items).toEqual([]);
  });

  test('reviewers without a user are skipped', () => {
    expect(pullRequests([pr({ reviewers: [{ user: null }, null] })], MEERA).items[0]?.reviewers).toEqual([]);
  });
});

describe('ownedPages', () => {
  test('unwraps the persisted query rows and dedupes the double row', () => {
    const { items } = ownedPages(nodesOf('ownedPages'), MEERA);
    expect(items).toEqual([
      {
        ari: 'ari:cloud:confluence:7251940d-1e14-4314-b9e9-647e62148c96:page/2719746',
        kind: 'confluence_page',
        title: 'Baton spike: graph pages probe',
        url: 'https://one-atlas-ubvd.atlassian.net/wiki/spaces/EO/pages/2719746/Baton+spike+graph+pages+probe',
        status: 'CURRENT',
        updatedAt: '2026-11-16T14:28:52.775Z',
        collaborators: [MEERA],
        subjectRole: 'owner',
        container: 'EO',
      },
    ]);
  });

  const row = (page: Record<string, unknown>) => ({
    columns: [{ key: 'page', value: { __typename: 'CypherQueryResultNode', id: page.id, data: page } }],
  });
  const page = (over: Record<string, unknown> = {}) => ({
    __typename: 'ConfluencePage',
    id: 'ari:page',
    title: 'Runbook',
    webUrl: 'https://x/wiki/runbook',
    status: 'CURRENT',
    owner: { id: OTHER, name: 'Arjun Rao' },
    author: { id: MEERA, name: 'Meera Iyer' },
    lastEditor: { id: OTHER, name: 'Arjun Rao' },
    space: { key: 'PAY' },
    ...over,
  });

  test('a page the subject created but someone else owns makes them the author', () => {
    expect(ownedPages([row(page())], MEERA).items[0]).toMatchObject({
      subjectRole: 'author',
      collaborators: [OTHER, MEERA],
    });
  });

  test('archived, deleted and trashed pages are dropped; drafts stay', () => {
    const rows = ['ARCHIVED', 'DELETED', 'TRASHED', 'HISTORICAL', 'DRAFT'].map((status, n) =>
      row(page({ id: `p${n}`, status })),
    );
    expect(ownedPages(rows, MEERA).items.map((i) => i.status)).toEqual(['DRAFT']);
  });

  test('rows with a null or non-page value are skipped', () => {
    const bad = [{ columns: [{ key: 'page', value: null }] }, { columns: null }, row({ __typename: 'JiraWorkItem', id: 'x' })];
    expect(ownedPages(bad, MEERA).items).toEqual([]);
  });
});

describe('goalsAndProjects', () => {
  test('maps the recorded goal the subject owns', () => {
    expect(goalsAndProjects(nodesOf('goalsAndProjects'), MEERA).items).toEqual([
      {
        ari: 'ari:cloud:townsquare:7251940d-1e14-4314-b9e9-647e62148c96:goal/aec60246-0ea4-4374-8efc-e58943b3e508',
        kind: 'goal',
        title: 'Reduce failed payment retries by 30%',
        url: 'https://home.atlassian.com/o/d3b9a3fd-ccd7-49e2-86d0-8f5d3ad822cb/s/7251940d-1e14-4314-b9e9-647e62148c96/goal/GGTRTEJK-34',
        key: 'GGTRTEJK-34',
        collaborators: [MEERA],
        subjectRole: 'owner',
      },
    ]);
  });

  const project = (over: Record<string, unknown> = {}) => ({
    __typename: 'AtlassianProject',
    id: 'ari:proj',
    name: 'Retry v2',
    url: 'https://x/project/1',
    archived: false,
    state: 'AT_RISK',
    owner: { id: MEERA, name: 'Meera Iyer' },
    ...over,
  });

  test('without roles the query includes things the subject only watches, so only owned ones are kept', () => {
    expect(goalsAndProjects([project({ owner: { id: OTHER } })], MEERA).items).toEqual([]);
  });

  test('archived, done and cancelled projects are dropped', () => {
    const nodes = [
      project({ archived: true }),
      project({ id: 'b', state: 'DONE' }),
      project({ id: 'c', state: 'CANCELLED' }),
      project({ id: 'd', state: 'ARCHIVED' }),
    ];
    expect(goalsAndProjects(nodes, MEERA).items).toEqual([]);
  });

  test('maps project states onto status categories', () => {
    const nodes = [project({ id: 'a', state: 'PENDING' }), project({ id: 'b', state: 'ON_TRACK' })];
    expect(goalsAndProjects(nodes, MEERA).items.map((p) => `${p.status}:${p.statusCategory}`)).toEqual([
      'PENDING:todo',
      'ON_TRACK:in_progress',
    ]);
  });

  test('paused projects count as to do', () => {
    expect(goalsAndProjects([project({ state: 'PAUSED' })], MEERA).items[0]?.statusCategory).toBe('todo');
  });
});

describe('teams and users', () => {
  test('maps the recorded teams', () => {
    const t = teams(nodesOf('userTeams'));
    expect(t).toEqual([
      { ari: 'ari:cloud:identity::team/1bd3d0ef-b454-4fd7-80c9-19c245a26c60', name: 'Platform' },
      { ari: 'ari:cloud:identity::team/49999cf4-063e-4f30-b8b0-a0702098af66', name: 'Payments' },
    ]);
  });

  test('the app-403 recording has no usable teams', () => {
    expect(teams(nodesOf('userTeams.app-403'))).toEqual([]);
  });

  test('maps the recorded team members to ARIs and names', () => {
    const u = users(nodesOf('teamMembers'));
    expect(u.aris).toHaveLength(5);
    expect(u.aris).toContain(MEERA);
    expect(u.people['712020:c29f7e54-6c0b-4b0a-8fb4-fde14d848855']).toBe('Priya Nair');
  });

  test('maps the recorded page contributors', () => {
    expect(users(nodesOf('pageContributors')).aris).toEqual([MEERA]);
  });
});

describe('issuePullRequests', () => {
  test("maps the recorded Bitbucket PR linked to PAY-7: Arjun's, Meera reviews; names are null", () => {
    const { items } = issuePullRequests(nodesOf('issuePullRequests'), 'Meera Iyer');
    expect(items).toEqual([
      {
        ari: 'ari:cloud:graph::pull-request/activation/e941c6bc-98af-41fd-8215-b554bb5d7196/759140ab-71b1-45f5-9588-5fd1cdb960af',
        kind: 'pull_request',
        title: 'PAY-7 Idempotency keys for settlement captures',
        url: 'https://bitbucket.org/{4ccb998a-926d-4549-be3f-9d6169d0e399}/{863d4db4-20e1-47e0-9281-74f290122838}/pull-requests/3',
        status: 'OPEN',
        statusCategory: 'in_progress',
        updatedAt: '2026-11-23T05:39:03.840Z',
        collaborators: [],
        // A first guess from the (null) author name; applyPullRequestDetails settles it by ID.
        subjectRole: 'reviewer',
        container: '7b38363364346462342d323065312d343765302d393238312d3734663239303132323833387d',
      },
    ]);
  });

  test("someone else's PR is a first guess at 'reviewer' (the backend checks), and closed PRs are dropped", () => {
    const [node] = nodesOf('issuePullRequests') as any[];
    expect(issuePullRequests([{ ...node, author: { name: 'Arjun Rao' } }], 'Meera Iyer').items[0]?.subjectRole).toBe('reviewer');
    expect(issuePullRequests([{ ...node, status: 'MERGED' }], 'Meera Iyer').items).toEqual([]);
  });
});
