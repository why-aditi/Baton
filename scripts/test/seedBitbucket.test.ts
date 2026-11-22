import { beforeEach, describe, expect, test } from 'vitest';
import { seedBitbucket, type BitbucketApi } from '../seed/bitbucket';
import type { SeedPullRequest, UserKey } from '../seed/story';

class FakeBitbucket implements BitbucketApi {
  repo = false;
  branches = new Map<string, UserKey[]>(); // branch -> commit authors
  prs: { id: number; branch: string; title: string; author: UserKey; reviewers: string[]; state: string }[] = [];
  calls: string[] = [];

  async accountId(user: UserKey) {
    return `bb-${user}`;
  }
  async repoExists() {
    return this.repo;
  }
  async createRepo(as: UserKey) {
    this.repo = true;
    this.calls.push(`create repo as ${as}`);
  }
  async branchExists(name: string) {
    return this.branches.has(name);
  }
  async commit(as: UserKey, c: { branch: string; path: string; content: string; message: string }) {
    if (c.branch !== 'main' && !this.branches.has('main')) throw new Error('no main to branch from');
    this.branches.set(c.branch, [...(this.branches.get(c.branch) ?? []), as]);
    this.calls.push(`commit ${c.branch}/${c.path} as ${as}`);
  }
  async openPullRequest(branch: string) {
    const pr = this.prs.find((p) => p.branch === branch && p.state === 'OPEN');
    return pr && { id: pr.id };
  }
  async createPullRequest(as: UserKey, pr: { title: string; branch: string; reviewers: string[]; description: string }) {
    const id = this.prs.length + 1;
    this.prs.push({ id, branch: pr.branch, title: pr.title, author: as, reviewers: pr.reviewers, state: 'OPEN' });
    this.calls.push(`PR #${id} ${pr.branch} as ${as}`);
    return { id };
  }
}

const prs: SeedPullRequest[] = [
  { branch: 'meera/jitter', title: 'Add jitter', author: 'meera', reviewers: [], issue: 'hero', file: { path: 'a.md', content: 'a' } },
  { branch: 'arjun/idem', title: 'Idempotency', author: 'arjun', reviewers: ['meera'], file: { path: 'b.md', content: 'b' } },
];

let bb: FakeBitbucket;
const opts = () => ({ jiraKeys: { hero: 'PAY-1' }, log: () => {} });

beforeEach(() => {
  bb = new FakeBitbucket();
});

describe('seedBitbucket', () => {
  test('creates the repo and main as Meera, then each branch and PR as its author', async () => {
    const r = await seedBitbucket(bb, prs, opts());
    expect(r).toEqual({ created: 2, unchanged: 0 });
    expect(bb.calls).toEqual([
      'create repo as meera',
      'commit main/README.md as meera',
      'commit meera/jitter/a.md as meera',
      'PR #1 meera/jitter as meera',
      'commit arjun/idem/b.md as arjun',
      'PR #2 arjun/idem as arjun',
    ]);
  });

  test('puts the Jira key in the title when the issue was seeded', async () => {
    await seedBitbucket(bb, prs, opts());
    expect(bb.prs.map((p) => p.title)).toEqual(['PAY-1 Add jitter', 'Idempotency']);
  });

  test('requests the story reviewers by account ID', async () => {
    await seedBitbucket(bb, prs, opts());
    expect(bb.prs.map((p) => p.reviewers)).toEqual([[], ['bb-meera']]);
  });

  test('a second run changes nothing', async () => {
    await seedBitbucket(bb, prs, opts());
    bb.calls = [];
    expect(await seedBitbucket(bb, prs, opts())).toEqual({ created: 0, unchanged: 2 });
    expect(bb.calls).toEqual([]);
  });

  test('a branch that exists without a PR gets just the PR', async () => {
    bb.repo = true;
    bb.branches.set('main', ['meera']).set('meera/jitter', ['meera']);
    await seedBitbucket(bb, prs.slice(0, 1), opts());
    expect(bb.calls).toEqual(['PR #1 meera/jitter as meera']);
  });
});
