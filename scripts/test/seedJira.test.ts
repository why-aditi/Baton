import { beforeEach, describe, expect, test } from 'vitest';
import { seedJira, type JiraApi, type SeededIssue } from '../seed/jira';
import { SEED_LABEL, type SeedIssue, type UserKey } from '../seed/story';

/** An in-memory Jira that records who did what. */
class FakeJira implements JiraApi {
  issues: (SeededIssue & { project: string; summary: string; reporter: UserKey; dueDate?: string; labels: string[]; comments: { by: UserKey; text: string }[] })[] = [];
  projects = new Set(['PAY', 'PLAT']);
  calls: string[] = [];
  noTransitionTo = new Set<string>();

  async accountId(user: UserKey) {
    return `acc-${user}`;
  }
  async projectExists(key: string) {
    return this.projects.has(key);
  }
  async findSeeded() {
    return this.issues.map(({ id, key, seedId, assigneeId, category }) => ({ id, key, seedId, assigneeId, category }));
  }
  async create(as: UserKey, i: { project: string; summary: string; labels: string[]; assigneeId?: string; dueDate?: string }) {
    const n = this.issues.filter((x) => x.project === i.project).length + 1;
    const key = `${i.project}-${n}`;
    const seedId = i.labels.find((l) => l.startsWith('seed-'))!.slice(5);
    this.issues.push({ id: `${100 + this.issues.length}`, key, seedId, category: 'todo', reporter: as, comments: [], ...i });
    this.calls.push(`create ${key} as ${as}`);
    return { id: `${99 + this.issues.length}`, key };
  }
  async comment(as: UserKey, key: string, text: string) {
    this.issues.find((x) => x.key === key)!.comments.push({ by: as, text });
    this.calls.push(`comment ${key} as ${as}`);
  }
  async transition(as: UserKey, key: string, to: SeededIssue['category']) {
    if (this.noTransitionTo.has(to)) return false;
    this.issues.find((x) => x.key === key)!.category = to;
    this.calls.push(`transition ${key} to ${to}`);
    return true;
  }
  async assign(as: UserKey, key: string, accountId: string | null) {
    this.issues.find((x) => x.key === key)!.assigneeId = accountId ?? undefined;
    this.calls.push(`assign ${key} to ${accountId}`);
  }
}

const story: SeedIssue[] = [
  { id: 'hero', project: 'PAY', summary: 'Retry backoff', reporter: 'meera', assignee: 'meera', status: 'in_progress', due: 3, comments: [] },
  { id: 'shared', project: 'PAY', summary: 'Redis failover', reporter: 'dana', assignee: 'meera', status: 'todo', comments: [{ by: 'dana', text: 'Saw it again.' }] },
  { id: 'unassigned', project: 'PLAT', summary: 'DNS', reporter: 'sam', status: 'done', comments: [] },
];

let jira: FakeJira;
const opts = { lastDay: '2026-12-30', issueType: 'Task', log: () => {} };

beforeEach(() => {
  jira = new FakeJira();
});

describe('seedJira', () => {
  test('creates each issue as its reporter, labelled, assigned and due relative to the last day', async () => {
    const r = await seedJira(jira, story, opts);
    expect(r).toMatchObject({ created: 3, fixed: 0, unchanged: 0 });
    expect(jira.issues[0]).toMatchObject({
      key: 'PAY-1',
      reporter: 'meera',
      assigneeId: 'acc-meera',
      dueDate: '2027-01-02',
      labels: [SEED_LABEL, 'seed-hero'],
      category: 'in_progress',
    });
    expect(jira.issues[2]?.assigneeId).toBeUndefined();
    expect(jira.issues[2]?.category).toBe('done');
    expect(r.keys).toEqual({ hero: 'PAY-1', shared: 'PAY-2', unassigned: 'PLAT-1' });
  });

  test('comments are written by their authors', async () => {
    await seedJira(jira, story, opts);
    expect(jira.issues[1]?.comments).toEqual([{ by: 'dana', text: 'Saw it again.' }]);
  });

  test('a second run changes nothing', async () => {
    await seedJira(jira, story, opts);
    jira.calls = [];
    const r = await seedJira(jira, story, opts);
    expect(r).toMatchObject({ created: 0, fixed: 0, unchanged: 3 });
    expect(jira.calls).toEqual([]);
  });

  test('puts back a changed assignee and status (this is also what reset does)', async () => {
    await seedJira(jira, story, opts);
    jira.issues[0]!.assigneeId = 'acc-arjun';
    jira.issues[1]!.category = 'done';
    jira.calls = [];
    const r = await seedJira(jira, story, opts);
    expect(r).toMatchObject({ created: 0, fixed: 2, unchanged: 1 });
    expect(jira.calls).toEqual(['assign PAY-1 to acc-meera', 'transition PAY-2 to todo']);
  });

  test('stops before writing anything when a project is missing', async () => {
    jira.projects.delete('PLAT');
    await expect(seedJira(jira, story, opts)).rejects.toThrow(/Create the Jira project PLAT/);
    expect(jira.calls).toEqual([]);
  });

  test('a status with no transition to it is reported, not fatal', async () => {
    jira.noTransitionTo.add('in_progress');
    const lines: string[] = [];
    const r = await seedJira(jira, story, { ...opts, log: (l) => lines.push(l) });
    expect(r.created).toBe(3);
    expect(lines.join('\n')).toMatch(/PAY-1: no transition to in_progress/);
  });
});
