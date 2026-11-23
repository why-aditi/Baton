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
const ISSUE = 'ari:cloud:jira:7251940d-1e14-4314-b9e9-647e62148c96:issue/66400';

describe('jiraWorkItems', () => {
  test('maps the recorded assigned issue', () => {
    const { items, people } = jiraWorkItems(nodesOf('assignedJira'), MEERA, 'assignee');
    expect(items).toEqual([
      {
        ari: ISSUE,
        kind: 'jira_issue',
        title: 'Baton spike: graph indexing probe',
        url: 'https://one-atlas-ubvd.atlassian.net/browse/SALES-31',
        key: 'SALES-31',
        status: 'To Do',
        statusCategory: 'todo',
        collaborators: [MEERA],
        subjectRole: 'assignee',
        container: 'SALES',
      },
    ]);
    expect(people).toEqual({ '712020:00000000-0000-4000-8000-00000000me01': 'Meera Iyer' });
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
  test('maps the recorded goals and projects the subject owns', () => {
    const { items } = goalsAndProjects(nodesOf('goalsAndProjects'), MEERA);
    expect(items.filter((i) => i.kind === 'goal')).toHaveLength(17);
    expect(items.filter((i) => i.kind === 'project')).toHaveLength(8);
    expect(items[0]).toEqual({
      ari: 'ari:cloud:townsquare:7251940d-1e14-4314-b9e9-647e62148c96:goal/f87ee4f3-cb16-4504-a558-ec62ee9f36fd',
      kind: 'goal',
      title: 'Mobile experience usage boost to 50% of global MAU',
      url: 'https://home.atlassian.com/o/d3b9a3fd-ccd7-49e2-86d0-8f5d3ad822cb/s/7251940d-1e14-4314-b9e9-647e62148c96/goal/GGTRTEJK-17',
      key: 'GGTRTEJK-17',
      updatedAt: '2026-11-12T11:06:13.118Z',
      dueDate: '2026-12-23',
      collaborators: [MEERA],
      subjectRole: 'owner',
    });
  });

  test('maps project states onto status categories', () => {
    const { items } = goalsAndProjects(nodesOf('goalsAndProjects'), MEERA);
    const projects = items.filter((i) => i.kind === 'project');
    expect(new Set(projects.map((p) => `${p.status}:${p.statusCategory}`))).toEqual(
      new Set(['PENDING:todo', 'ON_TRACK:in_progress']),
    );
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

  test('paused projects count as to do', () => {
    expect(goalsAndProjects([project({ state: 'PAUSED' })], MEERA).items[0]?.statusCategory).toBe('todo');
  });
});

describe('teams and users', () => {
  test('maps the recorded teams', () => {
    const t = teams(nodesOf('userTeams'));
    expect(t).toHaveLength(20);
    expect(t[0]).toEqual({ ari: 'ari:cloud:identity::team/7644ded0-55cf-436e-86df-6d7872f92738', name: 'Team Pulse' });
  });

  test('the app-403 recording has no usable teams', () => {
    expect(teams(nodesOf('userTeams.app-403'))).toEqual([]);
  });

  test('maps the recorded team members to ARIs and names', () => {
    const u = users(nodesOf('teamMembers'));
    expect(u.aris).toHaveLength(3);
    expect(u.aris).toContain(MEERA);
    expect(u.people['60ad34a79e21bd0071e6f4db']).toBe('Emma Paris');
  });

  test('maps the recorded page contributors', () => {
    expect(users(nodesOf('pageContributors')).aris).toEqual([MEERA]);
  });
});

describe('issuePullRequests', () => {
  test('maps the recorded Bitbucket PR linked to SALES-31; the subject wrote it', () => {
    const { items } = issuePullRequests(nodesOf('issuePullRequests'), 'Meera Iyer');
    expect(items).toEqual([
      {
        ari: 'ari:cloud:graph::pull-request/activation/e941c6bc-98af-41fd-8215-b554bb5d7196/c5d248a3-976c-4b54-ab5d-209efb1f29a8',
        kind: 'pull_request',
        title: 'SALES-31 Baton graph probe 2',
        url: 'https://bitbucket.org/{4ccb998a-926d-4549-be3f-9d6169d0e399}/{04d0e079-212a-4e68-ab1c-e939dfc24a0e}/pull-requests/2',
        status: 'OPEN',
        statusCategory: 'in_progress',
        updatedAt: '2026-11-22T10:35:13.843Z',
        collaborators: [],
        subjectRole: 'author',
        container: '7b30346430653037392d323132612d346536382d616231632d6539333964666332346130657d',
      },
    ]);
  });

  test("someone else's PR is a first guess at 'reviewer' (the backend checks), and closed PRs are dropped", () => {
    const [node] = nodesOf('issuePullRequests') as any[];
    expect(issuePullRequests([{ ...node, author: { name: 'Arjun Rao' } }], 'Meera Iyer').items[0]?.subjectRole).toBe('reviewer');
    expect(issuePullRequests([{ ...node, status: 'MERGED' }], 'Meera Iyer').items).toEqual([]);
  });
});
