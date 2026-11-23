import { describe, expect, test } from 'vitest';
import { applyPullRequestDetails, inferSubjectId, prDetailsFromGraph, type PrDetails } from '../src/enrich/pullRequests';
import type { Item } from '../src/types';

const URL1 = 'https://bitbucket.org/{ws}/{repo}/pull-requests/1';
const URL2 = 'https://bitbucket.org/{ws}/{repo}/pull-requests/2';
const URL3 = 'https://bitbucket.org/{ws}/{repo}/pull-requests/3';
const user = (id: string) => `ari:cloud:identity::user/${id}`;
const tp = (n: string) => `ari:cloud:identity::third-party-user/x/tp:${n}`;

// ExternalPullRequest nodes as Q.issuePullRequests returns them: people carry third-party IDs.
const nodes = [
  { __typename: 'ExternalPullRequest', id: 'pr1', url: URL1, author: { id: tp('m'), name: 'Meera Iyer' }, reviewers: [{ approvalStatus: 'UNAPPROVED', user: { id: tp('a'), name: 'Arjun Rao' } }] },
  { __typename: 'ExternalPullRequest', id: 'pr2', url: URL2, author: { id: tp('a'), name: 'Arjun Rao' }, reviewers: [{ user: { id: tp('m'), name: 'Meera Iyer' } }] },
  { __typename: 'ExternalPullRequest', id: 'pr4', url: 'https://x/4', author: null, reviewers: null },
  { __typename: 'Other', id: 'x', url: 'https://x/5' },
];

describe('prDetailsFromGraph', () => {
  test('reads author and reviewer IDs and names from graph nodes', () => {
    expect(prDetailsFromGraph(nodes)).toEqual([
      { url: URL1, author: { id: tp('m'), name: 'Meera Iyer' }, reviewers: [{ id: tp('a'), name: 'Arjun Rao' }] },
      { url: URL2, author: { id: tp('a'), name: 'Arjun Rao' }, reviewers: [{ id: tp('m'), name: 'Meera Iyer' }] },
      { url: 'https://x/4', reviewers: [] },
    ]);
  });

  test('keeps people whose name is null, by ID', () => {
    const [d] = prDetailsFromGraph([{ __typename: 'ExternalPullRequest', url: URL1, author: { id: tp('m'), name: null }, reviewers: [{ user: { id: tp('a'), name: null } }] }]);
    expect(d).toEqual({ url: URL1, author: { id: tp('m') }, reviewers: [{ id: tp('a') }] });
  });
});

describe('applyPullRequestDetails', () => {
  const pr = (url: string, over: Partial<Item> = {}): Item => ({
    ari: `ari:pr:${url}`, kind: 'pull_request', title: 't', url, collaborators: [], subjectRole: 'reviewer', ...over,
  });
  const people = { meera: 'Meera Iyer', arjun: 'Arjun Rao', lin: 'Lin Chen', lin2: 'Lin Chen' };
  const subject = { accountId: 'meera', name: 'Meera Iyer' };
  const details = (extra: PrDetails[] = []) => [...prDetailsFromGraph(nodes), ...extra];

  test("sets the subject's role and turns names into user ARIs", () => {
    const [mine, reviewed] = applyPullRequestDetails([pr(URL1), pr(URL2)], details(), people, subject);
    expect(mine).toMatchObject({ subjectRole: 'author', reviewers: [user('arjun')], collaborators: [user('meera'), user('arjun')] });
    // Meera is the only reviewer of Arjun's PR: this is what "No other reviewer" needs.
    expect(reviewed).toMatchObject({ subjectRole: 'reviewer', reviewers: [user('meera')], collaborators: [user('arjun'), user('meera')] });
  });

  test('drops PRs the subject neither wrote nor reviews', () => {
    const other: PrDetails = { url: URL3, author: { name: 'Arjun Rao' }, reviewers: [{ name: 'Lin Chen' }] };
    expect(applyPullRequestDetails([pr(URL3)], details([other]), people, subject)).toEqual([]);
  });

  test("an unmatched or ambiguous reviewer leaves reviewers empty, so 'No other reviewer' can't fire wrongly", () => {
    const unknown: PrDetails = { url: URL3, author: { name: 'Arjun Rao' }, reviewers: [{ name: 'Meera Iyer' }, { name: 'Lin Chen' }] };
    const [item] = applyPullRequestDetails([pr(URL3)], details([unknown]), people, subject);
    expect(item?.reviewers).toEqual([]);
    expect(item?.subjectRole).toBe('reviewer');
    expect(item?.collaborators).toEqual([user('arjun'), user('meera')]);
  });

  test('matches names regardless of case and spacing', () => {
    const odd: PrDetails = { url: URL3, author: { name: '  meera iyer ' }, reviewers: [] };
    expect(applyPullRequestDetails([pr(URL3)], details([odd]), people, subject)[0]?.subjectRole).toBe('author');
  });

  test('items without details, and non-PR items, are kept as they were', () => {
    const issue: Item = { ari: 'i', kind: 'jira_issue', title: 'i', url: 'https://x/i', collaborators: [], subjectRole: 'assignee' };
    const unknownPr = pr('https://bitbucket.org/other/pull-requests/9', { subjectRole: 'author' });
    expect(applyPullRequestDetails([issue, unknownPr], details(), people, subject)).toEqual([issue, unknownPr]);
  });
});

// As on the seeded demo site (Nov 23): every name null, only third-party IDs.
const nameless = (url: string, author: string, reviewers: string[] = []): PrDetails => ({
  url, author: { id: tp(author) }, reviewers: reviewers.map((r) => ({ id: tp(r) })),
});

describe('inferSubjectId', () => {
  test("picks the ID on most PRs linked to the subject's issues", () => {
    // Meera wrote two and reviews Arjun's third.
    expect(inferSubjectId([nameless(URL1, 'm'), nameless(URL2, 'm'), nameless(URL3, 'a', ['m'])])).toBe(tp('m'));
  });

  test('gives up on a single PR or a tie', () => {
    expect(inferSubjectId([nameless(URL1, 'm')])).toBeUndefined();
    expect(inferSubjectId([nameless(URL1, 'm', ['a']), nameless(URL2, 'a', ['m'])])).toBeUndefined();
    expect(inferSubjectId([])).toBeUndefined();
  });
});

describe('applyPullRequestDetails without names', () => {
  const pr = (url: string): Item => ({ ari: `ari:pr:${url}`, kind: 'pull_request', title: 't', url, collaborators: [], subjectRole: 'reviewer' });
  const subject = { accountId: 'meera', name: 'Meera Iyer', thirdPartyId: tp('m') };
  const details = [nameless(URL1, 'm'), nameless(URL2, 'a', ['m']), nameless(URL3, 'a', ['l'])];

  test('recognises the subject by third-party ID', () => {
    const [mine, reviewed] = applyPullRequestDetails([pr(URL1), pr(URL2), pr(URL3)], details, {}, subject);
    expect(mine).toMatchObject({ subjectRole: 'author', reviewers: [], collaborators: [user('meera')] });
    // Meera is the only reviewer of Arjun's PR, so "No other reviewer" can fire.
    expect(reviewed).toMatchObject({ subjectRole: 'reviewer', reviewers: [user('meera')], collaborators: [user('meera')] });
    // Arjun has no name, so he isn't a collaborator (no owner suggestion), but he's counted.
    expect(reviewed?.unnamedOthers).toBe(1);
    expect(mine?.unnamedOthers).toBeUndefined();
  });

  test('without the ID, nameless PRs are dropped rather than guessed', () => {
    expect(applyPullRequestDetails([pr(URL1)], details, {}, { accountId: 'meera', name: 'Meera Iyer' })).toEqual([]);
  });
});
