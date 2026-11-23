// Bitbucket pull requests, found through the Jira issues they mention.
//
// Teamwork Graph files Bitbucket PR authors and reviewers under third-party IDs
// (ari:cloud:identity::third-party-user/…), not Atlassian accounts, so "this person's PRs"
// (atlassianUserPullRequests) returns nothing. Asking an issue for its linked PRs works and gives
// display names. This file matches those names to Atlassian accounts.
//
// Jira's development-info API (/rest/dev-status) would also give reviewers, but it only accepts a
// browser session: from Forge it answers "Authentication Required".
import type { Item } from '../types';

export type PrPerson = { name: string };
export type PrDetails = { url: string; author?: PrPerson; reviewers: PrPerson[] };

const person = (u: any): PrPerson | undefined =>
  typeof u?.name === 'string' && u.name.trim() ? { name: u.name.trim() } : undefined;

/** Authors and reviewers by name, from graph ExternalPullRequest nodes (Q.issuePullRequests). */
export const prDetailsFromGraph = (nodes: unknown[]): PrDetails[] =>
  (nodes as any[])
    .filter((n) => n?.__typename === 'ExternalPullRequest' && typeof n.url === 'string')
    .map((n) => ({
      url: n.url,
      ...(person(n.author) && { author: person(n.author) }),
      reviewers: (n.reviewers ?? []).map((r: any) => person(r?.user)).filter((r: PrPerson | undefined): r is PrPerson => !!r),
    }));

const norm = (name: string) => name.trim().toLowerCase();

/**
 * Fills reviewers, collaborators and the subject's role on pull request items from the details,
 * matched by URL. Names become user ARIs through `people` (account ID → display name); names that
 * match nobody, or more than one person, are left out. PRs the subject neither wrote nor reviews
 * are dropped. Items with no details are kept as they were.
 */
export const applyPullRequestDetails = (
  items: Item[],
  details: PrDetails[],
  people: Record<string, string>,
  subject: { accountId: string; name: string },
): Item[] => {
  const byUrl = new Map(details.map((d) => [d.url, d]));
  const ids = new Map<string, string[]>();
  for (const [id, name] of Object.entries(people)) ids.set(norm(name), [...(ids.get(norm(name)) ?? []), id]);
  const ariOf = (name: string) => {
    const found = ids.get(norm(name));
    return found?.length === 1 ? `ari:cloud:identity::user/${found[0]}` : undefined;
  };
  const subjectAri = `ari:cloud:identity::user/${subject.accountId}`;
  const isSubject = (p?: PrPerson) => !!p && norm(p.name) === norm(subject.name);
  const known = (a: string | undefined): a is string => !!a;

  return items.flatMap((item) => {
    const d = item.kind === 'pull_request' ? byUrl.get(item.url) : undefined;
    if (!d) return [item];
    const authored = isSubject(d.author);
    const reviews = d.reviewers.some(isSubject);
    if (!authored && !reviews) return [];
    const reviewers = d.reviewers.map((r) => (isSubject(r) ? subjectAri : ariOf(r.name)));
    const author = d.author && (authored ? subjectAri : ariOf(d.author.name));
    // A reviewer we can't match still counts as "another reviewer". Rather than invent an ID (it would
    // become an owner suggestion), leave reviewers empty so "No other reviewer" can't fire wrongly.
    const allMatched = reviewers.every(known);
    return [
      {
        ...item,
        reviewers: allMatched ? [...new Set(reviewers.filter(known))] : [],
        collaborators: [...new Set([...item.collaborators, ...[author, ...reviewers].filter(known)])],
        subjectRole: authored ? ('author' as const) : ('reviewer' as const),
      },
    ];
  });
};
