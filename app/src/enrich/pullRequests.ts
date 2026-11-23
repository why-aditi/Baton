// Bitbucket pull requests, found through the Jira issues they mention.
//
// Teamwork Graph files Bitbucket PR authors and reviewers under third-party IDs
// (ari:cloud:identity::third-party-user/…), not Atlassian accounts, so "this person's PRs"
// (atlassianUserPullRequests) returns nothing. Asking an issue for its linked PRs works. People come
// with a stable third-party ID and, sometimes, a display name: on the seeded demo PRs every name was
// still null hours later (Nov 23). This file matches people to Atlassian accounts by name where there
// is one, and recognises the subject by their third-party ID otherwise (inferSubjectId).
//
// Jira's development-info API (/rest/dev-status) would also give reviewers, but it only accepts a
// browser session: from Forge it answers "Authentication Required".
import type { Item } from '../types';

export type PrPerson = { id?: string; name?: string };
export type PrDetails = { url: string; author?: PrPerson; reviewers: PrPerson[] };

const person = (u: any): PrPerson | undefined => {
  const id = typeof u?.id === 'string' && u.id ? u.id : undefined;
  const name = typeof u?.name === 'string' && u.name.trim() ? u.name.trim() : undefined;
  return id || name ? { ...(id && { id }), ...(name && { name }) } : undefined;
};

/** Authors and reviewers (ID and name, when there is one) from graph ExternalPullRequest nodes. */
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
 * The subject's third-party ID, from PRs linked to issues assigned to them: the ID on the most of
 * those PRs, as author or reviewer. Needs at least 2 PRs and a clear lead over the next ID, else
 * undefined (then only names can match).
 * ponytail: a heuristic; a teammate who touches every PR on the subject's issues would tie and
 * match no one. Swap for a real Bitbucket-to-Atlassian mapping if the graph ever exposes one.
 */
export const inferSubjectId = (details: PrDetails[]): string | undefined => {
  const counts = new Map<string, number>();
  for (const d of details) {
    for (const id of new Set([d.author, ...d.reviewers].map((p) => p?.id).filter((x): x is string => !!x))) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  const [first, second] = [...counts].sort((a, b) => b[1] - a[1]);
  return first && first[1] >= 2 && first[1] > (second?.[1] ?? 0) ? first[0] : undefined;
};

/**
 * Fills reviewers, collaborators and the subject's role on pull request items from the details,
 * matched by URL. The subject is recognised by name or by `subject.thirdPartyId`. Other names become
 * user ARIs through `people` (account ID → display name); people with no name, or a name that matches
 * nobody or more than one person, are left out. PRs the subject neither wrote nor reviews are dropped.
 * Items with no details are kept as they were.
 */
export const applyPullRequestDetails = (
  items: Item[],
  details: PrDetails[],
  people: Record<string, string>,
  subject: { accountId: string; name: string; thirdPartyId?: string },
): Item[] => {
  const byUrl = new Map(details.map((d) => [d.url, d]));
  const ids = new Map<string, string[]>();
  for (const [id, name] of Object.entries(people)) ids.set(norm(name), [...(ids.get(norm(name)) ?? []), id]);
  const ariOf = (name?: string) => {
    const found = name ? ids.get(norm(name)) : undefined;
    return found?.length === 1 ? `ari:cloud:identity::user/${found[0]}` : undefined;
  };
  const subjectAri = `ari:cloud:identity::user/${subject.accountId}`;
  const isSubject = (p?: PrPerson) =>
    !!p && ((!!p.name && norm(p.name) === norm(subject.name)) || (!!p.id && p.id === subject.thirdPartyId));
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
