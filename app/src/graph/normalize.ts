// Turns Teamwork Graph nodes into Items. Shapes come from the recorded responses and schema in
// test/fixtures/. Every function takes the nodes runPaged returns and tolerates nulls and
// unexpected types by skipping them.
import type { Item, SubjectRole } from '../types';

type UserRef = { id?: string | null; name?: string | null } | null | undefined;
export type People = Record<string, string>;
export type Normalized = { items: Item[]; people: People };

const accountIdOf = (ari: string) => ari.slice(ari.lastIndexOf('/') + 1);
const dateOnly = (iso?: string | null) => (iso ? iso.slice(0, 10) : undefined);

/** Drops undefined fields so items stay small and compare cleanly. */
const clean = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as T;

/** Collects user ARIs (deduped, in order) and their display names. */
const collect = (people: People, ...refs: UserRef[]) => {
  const aris: string[] = [];
  for (const r of refs) {
    if (!r?.id) continue;
    if (!aris.includes(r.id)) aris.push(r.id);
    if (r.name) people[accountIdOf(r.id)] = r.name;
  }
  return aris;
};

const isType = (n: any, type: string): n is Record<string, any> => !!n && n.__typename === type && !!n.id;

// ---- Jira ----

const JIRA_CATEGORY: Record<string, Item['statusCategory']> = {
  new: 'todo',
  indeterminate: 'in_progress',
  done: 'done',
};

/**
 * Open Jira work items. JiraWorkItem has no updated timestamp and no sprint in the graph, so the
 * "stale" and "sprint ends" risk signals can't fire from these alone.
 */
export const jiraWorkItems = (nodes: unknown[], subjectAri: string, role: SubjectRole): Normalized => {
  const people: People = {};
  const items: Item[] = [];
  for (const n of nodes) {
    if (!isType(n, 'JiraWorkItem')) continue;
    const statusCategory = JIRA_CATEGORY[n.status?.statusCategory?.key];
    if (statusCategory === 'done' || n.resolvedAt) continue;
    items.push(
      clean({
        ari: n.id,
        kind: 'jira_issue' as const,
        title: n.summary || n.key || 'Untitled issue',
        url: n.webUrl ?? '',
        key: n.key,
        status: n.status?.name,
        statusCategory,
        dueDate: dateOnly(n.dueAt),
        collaborators: collect(people, n.assignee, n.reporter),
        subjectRole: role,
        container: typeof n.key === 'string' ? n.key.split('-')[0] : undefined,
      }),
    );
  }
  return { items, people };
};

// ---- Pull requests ----

const OPEN_PR = new Set(['OPEN', 'DRAFT']);
const CLOSED_PR = new Set(['MERGED', 'DECLINED']);

export const pullRequests = (nodes: unknown[], subjectAri: string): Normalized => {
  const people: People = {};
  const items: Item[] = [];
  for (const n of nodes) {
    if (!isType(n, 'ExternalPullRequest') || CLOSED_PR.has(n.status)) continue;
    const reviewerRefs: UserRef[] = (n.reviewers ?? []).map((r: any) => r?.user);
    // The query runs without `roles` (it errors), so keep only PRs the subject wrote or reviews.
    if (n.author?.id !== subjectAri && !reviewerRefs.some((r) => r?.id === subjectAri)) continue;
    const reviewers = collect(people, ...reviewerRefs);
    items.push(
      clean({
        ari: n.id,
        kind: 'pull_request' as const,
        title: n.title || n.displayId || 'Untitled pull request',
        url: n.url ?? '',
        status: n.status,
        statusCategory: OPEN_PR.has(n.status) ? ('in_progress' as const) : undefined,
        updatedAt: n.lastUpdatedAt,
        collaborators: collect(people, n.author, ...reviewerRefs),
        reviewers,
        subjectRole: n.author?.id === subjectAri ? ('author' as const) : ('reviewer' as const),
        container: n.repositoryId,
      }),
    );
  }
  return { items, people };
};

// ---- Confluence pages (persisted query PQ_USER_OWNED_PAGES) ----

const LIVE_PAGE = new Set(['CURRENT', 'DRAFT']);

/**
 * Rows of the owned-pages persisted query. The query returns a page once per relationship (owns,
 * created), so pages are deduped by ARI. Link counts aren't in the graph, so "widely referenced"
 * can't fire from these alone.
 */
export const ownedPages = (rows: unknown[], subjectAri: string): Normalized => {
  const people: People = {};
  const items = new Map<string, Item>();
  for (const row of rows as any[]) {
    for (const col of row?.columns ?? []) {
      const p = col?.value?.data;
      if (!isType(p, 'ConfluencePage') || items.has(p.id) || !LIVE_PAGE.has(p.status)) continue;
      items.set(
        p.id,
        clean({
          ari: p.id,
          kind: 'confluence_page' as const,
          title: p.title || 'Untitled page',
          url: p.webUrl ?? '',
          status: p.status,
          updatedAt: p.lastUpdatedAt,
          collaborators: collect(people, p.owner, p.author, p.lastEditor),
          subjectRole: p.owner?.id === subjectAri ? ('owner' as const) : ('author' as const),
          container: p.space?.key,
        }),
      );
    }
  }
  return { items: [...items.values()], people };
};

// ---- Goals and projects ----

const PROJECT_CATEGORY: Record<string, Item['statusCategory']> = {
  PENDING: 'todo',
  PAUSED: 'todo',
  ON_TRACK: 'in_progress',
  AT_RISK: 'in_progress',
  OFF_TRACK: 'in_progress',
  DONE: 'done',
  CANCELLED: 'done',
  ARCHIVED: 'done',
};

/**
 * `roles` is broken on this query, so it returns everything linked to the user, including goals
 * they only watch. Only goals and projects the subject owns are kept.
 */
export const goalsAndProjects = (nodes: unknown[], subjectAri: string): Normalized => {
  const people: People = {};
  const items: Item[] = [];
  for (const n of nodes as any[]) {
    const isGoal = n?.__typename === 'AtlassianGoal';
    if (!n?.id || (!isGoal && n.__typename !== 'AtlassianProject')) continue;
    if (n.archived || n.owner?.id !== subjectAri) continue;
    const statusCategory = isGoal ? undefined : PROJECT_CATEGORY[n.state];
    if (statusCategory === 'done') continue;
    items.push(
      clean({
        ari: n.id,
        kind: isGoal ? ('goal' as const) : ('project' as const),
        title: n.name || n.key || 'Untitled',
        url: n.url ?? '',
        key: n.key,
        status: isGoal ? undefined : n.state,
        statusCategory,
        updatedAt: isGoal ? n.updatedAt : n.lastUpdatedAt,
        dueDate: dateOnly(n.dueDateEndedAt),
        collaborators: collect(people, n.owner),
        subjectRole: 'owner' as const,
      }),
    );
  }
  return { items, people };
};

// ---- Teams and users ----

export const teams = (nodes: unknown[]) =>
  nodes.filter((n) => isType(n, 'AtlassianTeam')).map((n: any) => ({ ari: n.id as string, name: (n.displayName as string) || 'Unnamed team' }));

/** AtlassianUser nodes (team members, page contributors) to ARIs plus a name map. */
export const users = (nodes: unknown[]) => {
  const people: People = {};
  const aris = collect(people, ...(nodes.filter((n) => isType(n, 'AtlassianUser')) as UserRef[]));
  return { aris, people };
};
