// Seeds Bitbucket: one repo and 6 open PRs, each branch committed and each PR opened by its author,
// with the story's reviewers. A Jira key in each title links the PR to its issue. Idempotent: an
// open PR for the branch means it's done.
import type { Config } from './lib/config';
import { isNotFound, makeHttp, type FetchLike, type Http } from './lib/http';
import { REPO, type SeedPullRequest, type UserKey } from './story';

export interface BitbucketApi {
  accountId(user: UserKey): Promise<string>;
  repoExists(): Promise<boolean>;
  createRepo(as: UserKey): Promise<void>;
  branchExists(name: string): Promise<boolean>;
  /** Commits one file. A new branch starts from main. */
  commit(as: UserKey, c: { branch: string; path: string; content: string; message: string }): Promise<void>;
  openPullRequest(branch: string): Promise<{ id: number } | undefined>;
  createPullRequest(as: UserKey, pr: { title: string; branch: string; reviewers: string[]; description: string }): Promise<{ id: number }>;
}

export const seedBitbucket = async (
  api: BitbucketApi,
  prs: SeedPullRequest[],
  opts: { jiraKeys: Record<string, string>; log: (line: string) => void },
) => {
  if (!(await api.repoExists())) {
    await api.createRepo('meera');
    opts.log(`  created repo ${REPO.slug}`);
  }
  if (!(await api.branchExists('main'))) {
    await api.commit('meera', {
      branch: 'main',
      path: 'README.md',
      content: '# payments-service\n\nNorthwind Pay payment processing, including the retry worker.\n',
      message: 'Initial commit',
    });
  }

  const result = { created: 0, unchanged: 0 };
  for (const pr of prs) {
    if (await api.openPullRequest(pr.branch)) {
      result.unchanged++;
      continue;
    }
    const key = pr.issue ? opts.jiraKeys[pr.issue] : undefined;
    const title = key ? `${key} ${pr.title}` : pr.title;
    if (!(await api.branchExists(pr.branch))) {
      await api.commit(pr.author, { branch: pr.branch, path: pr.file.path, content: pr.file.content, message: title });
    }
    const reviewers = await Promise.all(pr.reviewers.map((r) => api.accountId(r)));
    const { id } = await api.createPullRequest(pr.author, { title, branch: pr.branch, reviewers, description: pr.title });
    result.created++;
    opts.log(`  opened PR #${id} ${title}`);
  }
  return result;
};

// ---- Bitbucket Cloud REST adapter ----

export const bitbucketApi = (config: Config, fetch: FetchLike): BitbucketApi => {
  const clients = new Map<UserKey, Http>();
  const as = (user: UserKey) => {
    if (!clients.has(user)) {
      const { email, bitbucketToken } = config.users[user];
      clients.set(user, makeHttp({ fetch, baseUrl: 'https://api.bitbucket.org/2.0', email, token: bitbucketToken }));
    }
    return clients.get(user)!;
  };
  const q = encodeURIComponent;
  const repo = `/repositories/${q(config.workspace)}/${q(REPO.slug)}`;
  const reader = as('meera');
  const exists = async (path: string) => {
    try {
      await reader.json('GET', path);
      return true;
    } catch (e) {
      if (isNotFound(e)) return false;
      throw e;
    }
  };
  const ids = new Map<UserKey, Promise<string>>();

  return {
    accountId(user) {
      if (!ids.has(user)) ids.set(user, as(user).json('GET', '/user').then((u) => u.account_id as string));
      return ids.get(user)!;
    },
    repoExists: () => exists(repo),
    async createRepo(user) {
      await as(user).json('POST', repo, {
        scm: 'git',
        is_private: true,
        ...(config.bitbucketProject && { project: { key: config.bitbucketProject } }),
      });
    },
    branchExists: (name) => exists(`${repo}/refs/branches/${q(name)}`),
    async commit(user, c) {
      await as(user).form(`${repo}/src`, { message: c.message, branch: c.branch, [c.path]: c.content });
    },
    async openPullRequest(branch) {
      const r = await reader.json('GET', `${repo}/pullrequests?state=OPEN&q=${q(`source.branch.name="${branch}"`)}`);
      const pr = r.values?.[0];
      return pr ? { id: Number(pr.id) } : undefined;
    },
    async createPullRequest(user, pr) {
      const created = await as(user).json('POST', `${repo}/pullrequests`, {
        title: pr.title,
        description: pr.description,
        source: { branch: { name: pr.branch } },
        destination: { branch: { name: 'main' } },
        reviewers: pr.reviewers.map((account_id) => ({ account_id })),
        close_source_branch: false,
      });
      return { id: Number(created.id) };
    },
  };
};
