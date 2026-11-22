// Builds a person's inventory from Teamwork Graph, in the app page, as the signed-in user.
// The result is exactly what the saveInventory resolver takes (plus warnings for the UI).
import type { Team } from '../scoring/owners';
import type { Item } from '../types';
import { coverageWarnings, mergeItems, type SourceResult, type Warning } from './merge';
import { goalsAndProjects, jiraWorkItems, ownedPages, pullRequests, teams as toTeams, users, type People } from './normalize';
import { Q } from './queries';
import { runPaged, type GraphRequest, type RunResult } from './runner';

const MAX_TEAMS = 10;
const MAX_PAGES_FOR_CONTRIBUTORS = 30;
const MAX_ISSUES_FOR_COMMENTS = 40;
const MAX_CANDIDATES = 25;
const CONCURRENCY = 6;

export type Progress = { source: string; label: string; count: number; done: boolean };

export type Inventory = {
  items: Item[];
  teams: Team[];
  /** Open assigned item count per candidate user ARI, for owner ranking's load term. */
  openAssigned: Record<string, number>;
  /** Display names by account ID. */
  people: People;
  warnings: Warning[];
};

/** Runs fn over items with at most `limit` in flight. */
const mapLimit = async <T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> => {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
};

const SOURCES = {
  assignedJira: { label: 'assigned Jira work items', hint: 'read:graph:issue:jira' },
  reportedJira: { label: 'reported Jira work items', hint: 'read:graph:issue:jira' },
  pullRequests: { label: 'pull requests', hint: 'read:graph:pull-request:external' },
  pages: { label: 'Confluence pages', hint: 'read:graph:page:confluence' },
  goalsAndProjects: { label: 'goals or projects', hint: undefined },
  teams: { label: 'teams', hint: 'read:graph:team:atlassian' },
} as const;
type Source = keyof typeof SOURCES;

export const buildInventory = async (opts: {
  request: GraphRequest;
  subjectAri: string;
  /** PQ_USER_OWNED_PAGES from queryKeys.ts. */
  ownedPagesQueryKey: string;
  onProgress?: (p: Progress) => void;
  sleep?: (ms: number) => Promise<void>;
}): Promise<Inventory> => {
  const { request, subjectAri, sleep } = opts;
  const people: People = {};
  const results: SourceResult[] = [];
  const report = (source: string, label: string, count: number, done: boolean) =>
    opts.onProgress?.({ source, label, count, done });

  const run = async (source: Source, query: string, variables: Record<string, unknown>): Promise<RunResult> => {
    const { label, hint } = SOURCES[source];
    report(source, label, 0, false);
    const r = await runPaged({ request, query, variables, sleep, onPage: (n) => report(source, label, n, false) });
    results.push({ source, label, hint, count: r.nodes.length, dropped: r.dropped, errors: r.errors, truncated: r.truncated });
    report(source, label, r.nodes.length, true);
    return r;
  };
  const user = { userId: subjectAri };

  // 1. The person's own work and teams, in parallel.
  const [assigned, reported, prs, pages, goals, teamRun] = await Promise.all([
    run('assignedJira', Q.assignedJira, user),
    run('reportedJira', Q.reportedJira, user),
    run('pullRequests', Q.pullRequests, user),
    run('pages', Q.ownedPages, { queryKey: opts.ownedPagesQueryKey, queryParams: user }),
    run('goalsAndProjects', Q.goalsAndProjects, user),
    run('teams', Q.userTeams, user),
  ]);

  const normalized = [
    jiraWorkItems(assigned.nodes, subjectAri, 'assignee'),
    jiraWorkItems(reported.nodes, subjectAri, 'reporter'),
    pullRequests(prs.nodes, subjectAri),
    ownedPages(pages.nodes, subjectAri),
    goalsAndProjects(goals.nodes, subjectAri),
  ];
  for (const n of normalized) Object.assign(people, n.people);
  const items = mergeItems(normalized.map((n) => n.items));

  // 2. Details: team members, page contributors and issue commenters (more collaborators).
  report('details', 'collaborators', 0, false);
  const quiet = (query: string, variables: Record<string, unknown>) => runPaged({ request, query, variables, sleep, maxPages: 2 });
  const teamList = toTeams(teamRun.nodes).slice(0, MAX_TEAMS);
  const pageItems = items.filter((i) => i.kind === 'confluence_page').slice(0, MAX_PAGES_FOR_CONTRIBUTORS);
  const issueItems = items.filter((i) => i.kind === 'jira_issue').slice(0, MAX_ISSUES_FOR_COMMENTS);

  const [memberRuns, contributorRuns, commentRuns] = await Promise.all([
    mapLimit(teamList, CONCURRENCY, (t) => quiet(Q.teamMembers, { teamAri: t.ari })),
    mapLimit(pageItems, CONCURRENCY, (p) => quiet(Q.pageContributors, { id: p.ari })),
    mapLimit(issueItems, CONCURRENCY, (i) => quiet(Q.workItemComments, { id: i.ari })),
  ]);

  const teams: Team[] = teamList.map((t, n) => {
    const u = users(memberRuns[n]!.nodes);
    Object.assign(people, u.people);
    return { name: t.name, members: u.aris };
  });

  const addCollaborators = (item: Item, aris: string[]) => {
    for (const a of aris) if (!item.collaborators.includes(a)) item.collaborators.push(a);
  };
  pageItems.forEach((p, n) => {
    const u = users(contributorRuns[n]!.nodes);
    Object.assign(people, u.people);
    addCollaborators(p, u.aris);
  });
  issueItems.forEach((issue, n) => {
    const authors = (commentRuns[n]!.nodes as any[])
      .filter((c) => c?.__typename === 'JiraWorkItemComment' && !c.deleted && c.author?.id)
      .map((c) => {
        if (c.author.name) people[c.author.id.slice(c.author.id.lastIndexOf('/') + 1)] = c.author.name;
        return c.author.id as string;
      });
    addCollaborators(issue, authors);
  });

  // 3. Workload of the likely new owners: people on the items first, then teammates.
  const candidates = [
    ...new Set([...items.flatMap((i) => [...i.collaborators, ...(i.reviewers ?? [])]), ...teams.flatMap((t) => t.members)]),
  ]
    .filter((a) => a !== subjectAri)
    .slice(0, MAX_CANDIDATES);
  const loads = await mapLimit(candidates, CONCURRENCY, (userId) =>
    runPaged({ request, query: Q.openAssigned, variables: { userId }, sleep, maxPages: 1 }),
  );
  const openAssigned: Record<string, number> = {};
  candidates.forEach((c, n) => {
    openAssigned[c] = (loads[n]!.nodes as any[]).filter(
      (w) => w?.__typename === 'JiraWorkItem' && !w.resolvedAt && w.status?.statusCategory?.key !== 'done',
    ).length;
  });
  report('details', 'collaborators', candidates.length, true);

  const order = Object.keys(SOURCES);
  results.sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source));
  return { items, teams, openAssigned, people, warnings: coverageWarnings(results) };
};
