import { describe, expect, test } from 'vitest';
import { bitbucketApi } from '../seed/bitbucket';
import { confluenceApi } from '../seed/confluence';
import { jiraApi } from '../seed/jira';
import type { Config } from '../seed/lib/config';
import type { FetchLike } from '../seed/lib/http';

const config = {
  site: 'demo.atlassian.net',
  lastDay: '2026-12-30',
  spaceKey: 'NWP',
  workspace: 'nw',
  bitbucketProject: 'PAY',
  issueType: 'Task',
  users: Object.fromEntries(
    ['meera', 'arjun', 'lin', 'priya', 'sam', 'dana', 'omar'].map((u) => [u, { email: `${u}@x`, token: `t-${u}`, bitbucketToken: `bb-${u}` }]),
  ),
} as Config;

type Req = { method: string; url: string; user: string; body: any };

/** Routes "METHOD url-substring" to a reply; records every request with the user it ran as. */
const router = (routes: [string, (req: Req) => { status?: number; body?: unknown }][]) => {
  const reqs: Req[] = [];
  const fetch: FetchLike = async (url, init) => {
    const user = Buffer.from(init.headers.Authorization!.slice(6), 'base64').toString().split('@')[0]!;
    const ct = init.headers['Content-Type'];
    const body = init.body === undefined ? undefined : ct?.includes('json') ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(init.body));
    const req = { method: init.method, url, user, body };
    reqs.push(req);
    const hit = routes.find(([k]) => {
      const [m, part] = k.split(' ');
      return m === init.method && url.includes(part!);
    });
    const r = hit ? hit[1](req) : { status: 404 };
    const status = r.status ?? 200;
    return { ok: status < 300, status, headers: { get: () => null }, text: async () => (r.body === undefined ? '' : JSON.stringify(r.body)) };
  };
  return { fetch, reqs };
};

describe('jiraApi', () => {
  test('findSeeded pages with nextPageToken and reads seed IDs, assignees and status categories', async () => {
    let page = 0;
    const { fetch, reqs } = router([
      ['POST /rest/api/3/search/jql', () => {
        page++;
        return page === 1
          ? { body: { isLast: false, nextPageToken: 'n2', issues: [{ id: 1, key: 'PAY-1', fields: { labels: ['baton-seed', 'seed-hero'], assignee: { accountId: 'a1' }, status: { statusCategory: { key: 'indeterminate' } } } }] } }
          : { body: { isLast: true, issues: [{ id: 2, key: 'PAY-2', fields: { labels: ['baton-seed'], status: { statusCategory: { key: 'new' } } } }] } };
      }],
    ]);
    const found = await jiraApi(config, fetch).findSeeded();
    expect(found).toEqual([{ id: '1', key: 'PAY-1', seedId: 'hero', assigneeId: 'a1', category: 'in_progress' }]);
    expect(reqs.map((r) => r.body.nextPageToken)).toEqual([undefined, 'n2']);
    expect(reqs[0]).toMatchObject({ url: 'https://demo.atlassian.net/rest/api/3/search/jql', body: { jql: 'labels = "baton-seed"' } });
  });

  test('create sends the fields as the given user', async () => {
    const { fetch, reqs } = router([['POST /rest/api/3/issue', () => ({ status: 201, body: { id: '10', key: 'PAY-1' } })]]);
    const r = await jiraApi(config, fetch).create('dana', { project: 'PAY', summary: 'S', issueType: 'Task', labels: ['baton-seed'], assigneeId: 'a1', dueDate: '2027-01-02' });
    expect(r).toEqual({ id: '10', key: 'PAY-1' });
    expect(reqs[0]).toMatchObject({
      user: 'dana',
      body: { fields: { project: { key: 'PAY' }, summary: 'S', issuetype: { name: 'Task' }, labels: ['baton-seed'], assignee: { accountId: 'a1' }, duedate: '2027-01-02' } },
    });
  });

  test('transition picks the transition into the wanted status category', async () => {
    const { fetch, reqs } = router([
      ['GET /transitions', () => ({ body: { transitions: [{ id: '11', to: { statusCategory: { key: 'new' } } }, { id: '21', to: { statusCategory: { key: 'indeterminate' } } }] } })],
      ['POST /transitions', () => ({ status: 204 })],
    ]);
    const api = jiraApi(config, fetch);
    expect(await api.transition('meera', 'PAY-1', 'in_progress')).toBe(true);
    expect(reqs[1]).toMatchObject({ method: 'POST', body: { transition: { id: '21' } } });
    expect(await api.transition('meera', 'PAY-1', 'done')).toBe(false);
  });

  test('projectExists is false on 404 and accountId is cached per user', async () => {
    const { fetch, reqs } = router([['GET /myself', (r) => ({ body: { accountId: `acc-${r.user}` } })]]);
    const api = jiraApi(config, fetch);
    expect(await api.projectExists('PAY')).toBe(false);
    expect(await api.accountId('lin')).toBe('acc-lin');
    await api.accountId('lin');
    expect(reqs.filter((r) => r.url.endsWith('/myself'))).toHaveLength(1);
  });

  test('comments are sent as Atlassian document format', async () => {
    const { fetch, reqs } = router([['POST /comment', () => ({ status: 201, body: {} })]]);
    await jiraApi(config, fetch).comment('omar', 'PAY-5', 'Hello');
    expect(reqs[0]).toMatchObject({
      user: 'omar',
      body: { body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] } },
    });
  });
});

describe('confluenceApi', () => {
  test('edits send the new version number and storage body as the editor', async () => {
    const { fetch, reqs } = router([['PUT /wiki/api/v2/pages/7', () => ({ body: {} })]]);
    await confluenceApi(config, fetch).editPage('lin', '7', 'T', '<p>x</p>', 3);
    expect(reqs[0]).toMatchObject({
      user: 'lin',
      body: { id: '7', status: 'current', title: 'T', body: { representation: 'storage', value: '<p>x</p>' }, version: { number: 3 } },
    });
  });

  test('findPage asks by space and exact title', async () => {
    const { fetch, reqs } = router([['GET /wiki/api/v2/pages?', () => ({ body: { results: [{ id: 9, version: { number: 4 } }] } })]]);
    expect(await confluenceApi(config, fetch).findPage('s1', 'Retry & runbook')).toEqual({ id: '9', version: 4 });
    expect(reqs[0]!.url).toContain('space-id=s1&title=Retry%20%26%20runbook&status=current');
  });

  test('pagesWithPrefix follows _links.next', async () => {
    const { fetch } = router([
      ['GET cursor=2', () => ({ body: { results: [{ id: 2, title: 'Handover: B' }] } })],
      ['GET /spaces/s1/pages', () => ({ body: { results: [{ id: 1, title: 'Handover: A' }, { id: 3, title: 'Other' }], _links: { next: '/wiki/api/v2/spaces/s1/pages?cursor=2' } } })],
    ]);
    expect(await confluenceApi(config, fetch).pagesWithPrefix('s1', 'Handover: ')).toEqual([
      { id: '1', title: 'Handover: A' },
      { id: '2', title: 'Handover: B' },
    ]);
  });
});

describe('bitbucketApi', () => {
  test('commits a file to a branch as a form post, with the Bitbucket token', async () => {
    const { fetch, reqs } = router([['POST /src', () => ({ status: 201 })]]);
    await bitbucketApi(config, fetch).commit('arjun', { branch: 'arjun/x', path: 'a/b.md', content: 'hi', message: 'PAY-1 X' });
    expect(reqs[0]).toMatchObject({
      url: 'https://api.bitbucket.org/2.0/repositories/nw/payments-service/src',
      user: 'arjun',
      body: { message: 'PAY-1 X', branch: 'arjun/x', 'a/b.md': 'hi' },
    });
  });

  test('creates a PR into main with reviewers by account ID', async () => {
    const { fetch, reqs } = router([['POST /pullrequests', () => ({ status: 201, body: { id: 4 } })]]);
    expect(await bitbucketApi(config, fetch).createPullRequest('lin', { title: 'T', branch: 'lin/x', reviewers: ['r1'], description: 'D' })).toEqual({ id: 4 });
    expect(reqs[0]!.body).toEqual({
      title: 'T',
      description: 'D',
      source: { branch: { name: 'lin/x' } },
      destination: { branch: { name: 'main' } },
      reviewers: [{ account_id: 'r1' }],
      close_source_branch: false,
    });
  });

  test('branch names with slashes are encoded, and 404 means missing', async () => {
    const { fetch, reqs } = router([]);
    expect(await bitbucketApi(config, fetch).branchExists('meera/retry-jitter')).toBe(false);
    expect(reqs[0]!.url).toBe('https://api.bitbucket.org/2.0/repositories/nw/payments-service/refs/branches/meera%2Fretry-jitter');
  });

  test('createRepo is private and in the configured project', async () => {
    const { fetch, reqs } = router([['POST /repositories/nw/payments-service', () => ({ body: {} })]]);
    await bitbucketApi(config, fetch).createRepo('meera');
    expect(reqs[0]!.body).toEqual({ scm: 'git', is_private: true, project: { key: 'PAY' } });
  });

  test('looks for an open PR by source branch', async () => {
    const { fetch, reqs } = router([['GET /pullrequests', () => ({ body: { values: [{ id: 2 }] } })]]);
    expect(await bitbucketApi(config, fetch).openPullRequest('meera/x')).toEqual({ id: 2 });
    expect(decodeURIComponent(reqs[0]!.url)).toContain('state=OPEN&q=source.branch.name="meera/x"');
  });
});
