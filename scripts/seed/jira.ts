// Seeds Jira: about 60 issues in PAY and PLAT, each created by its story reporter, assigned,
// moved to its status, and commented on by the people the story names. Idempotent: issues are
// found again by their `seed-<id>` label, and a rerun only puts back assignees and statuses.
import type { Config } from './lib/config';
import { isNotFound, makeHttp, type FetchLike, type Http } from './lib/http';
import { SEED_LABEL, dueDate, issueLabel, type SeedIssue, type UserKey } from './story';

export type Category = 'todo' | 'in_progress' | 'done';
export type SeededIssue = { id: string; key: string; seedId: string; assigneeId?: string; category: Category };

export interface JiraApi {
  accountId(user: UserKey): Promise<string>;
  projectExists(key: string): Promise<boolean>;
  findSeeded(): Promise<SeededIssue[]>;
  create(
    as: UserKey,
    issue: { project: string; summary: string; issueType: string; labels: string[]; assigneeId?: string; dueDate?: string },
  ): Promise<{ id: string; key: string }>;
  comment(as: UserKey, key: string, text: string): Promise<void>;
  /** Moves the issue to a status in the category. False when the workflow has no such transition. */
  transition(as: UserKey, key: string, to: Category): Promise<boolean>;
  assign(as: UserKey, key: string, accountId: string | null): Promise<void>;
}

export type SeedJiraResult = { created: number; fixed: number; unchanged: number; keys: Record<string, string> };

export const seedJira = async (
  api: JiraApi,
  issues: SeedIssue[],
  opts: { lastDay: string; issueType: string; log: (line: string) => void },
): Promise<SeedJiraResult> => {
  for (const project of new Set(issues.map((i) => i.project))) {
    if (!(await api.projectExists(project))) {
      throw new Error(`Create the Jira project ${project} first (see scripts/README.md), then run this again.`);
    }
  }

  const existing = new Map((await api.findSeeded()).map((i) => [i.seedId, i]));
  const result: SeedJiraResult = { created: 0, fixed: 0, unchanged: 0, keys: {} };

  const moveTo = async (as: UserKey, key: string, to: Category) => {
    if (!(await api.transition(as, key, to))) opts.log(`  ${key}: no transition to ${to} in its workflow; set it by hand`);
  };

  for (const i of issues) {
    const assigneeId = i.assignee ? await api.accountId(i.assignee) : undefined;
    const actor = i.assignee ?? i.reporter;
    const found = existing.get(i.id);

    if (!found) {
      const { key } = await api.create(i.reporter, {
        project: i.project,
        summary: i.summary,
        issueType: opts.issueType,
        labels: [SEED_LABEL, issueLabel(i.id)],
        ...(assigneeId && { assigneeId }),
        ...(i.due !== undefined && { dueDate: dueDate(opts.lastDay, i.due) }),
      });
      for (const c of i.comments) await api.comment(c.by, key, c.text);
      if (i.status !== 'todo') await moveTo(actor, key, i.status);
      result.created++;
      result.keys[i.id] = key;
      opts.log(`  created ${key} ${i.summary}`);
      continue;
    }

    result.keys[i.id] = found.key;
    let changed = false;
    if (found.assigneeId !== assigneeId) {
      await api.assign(actor, found.key, assigneeId ?? null);
      changed = true;
    }
    if (found.category !== i.status) {
      await moveTo(actor, found.key, i.status);
      changed = true;
    }
    if (changed) {
      result.fixed++;
      opts.log(`  put back ${found.key} ${i.summary}`);
    } else result.unchanged++;
  }
  return result;
};

// ---- Jira Cloud REST adapter ----

const CATEGORY: Record<string, Category> = { new: 'todo', indeterminate: 'in_progress', done: 'done' };
const STATUS_KEY: Record<Category, string> = { todo: 'new', in_progress: 'indeterminate', done: 'done' };

/** Jira's rich text (ADF) for a plain paragraph. */
const adf = (text: string) => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

export const jiraApi = (config: Config, fetch: FetchLike): JiraApi => {
  const clients = new Map<UserKey, Http>();
  const as = (user: UserKey) => {
    if (!clients.has(user)) {
      const { email, token } = config.users[user];
      clients.set(user, makeHttp({ fetch, baseUrl: `https://${config.site}`, email, token }));
    }
    return clients.get(user)!;
  };
  const ids = new Map<UserKey, Promise<string>>();
  const admin = as('priya');
  // Story projects (PAY, PLAT) map to the site's real keys, e.g. PLAT is taken on Codegeist demo sites.
  const jiraKey = (story: string) => (config.projectKeys as Record<string, string> | undefined)?.[story] ?? story;

  return {
    accountId(user) {
      if (!ids.has(user)) ids.set(user, as(user).json('GET', '/rest/api/3/myself').then((m) => m.accountId as string));
      return ids.get(user)!;
    },

    async projectExists(key) {
      try {
        await admin.json('GET', `/rest/api/3/project/${encodeURIComponent(jiraKey(key))}`);
        return true;
      } catch (e) {
        if (isNotFound(e)) return false;
        throw e;
      }
    },

    async findSeeded() {
      const out: SeededIssue[] = [];
      let nextPageToken: string | undefined;
      do {
        const page = await admin.json('POST', '/rest/api/3/search/jql', {
          jql: `labels = "${SEED_LABEL}"`,
          fields: ['labels', 'assignee', 'status'],
          maxResults: 100,
          ...(nextPageToken && { nextPageToken }),
        });
        for (const issue of page.issues ?? []) {
          const seedLabel = (issue.fields?.labels ?? []).find((l: string) => l.startsWith('seed-'));
          if (!seedLabel) continue;
          out.push({
            id: String(issue.id),
            key: issue.key,
            seedId: seedLabel.slice('seed-'.length),
            assigneeId: issue.fields?.assignee?.accountId ?? undefined,
            category: CATEGORY[issue.fields?.status?.statusCategory?.key] ?? 'todo',
          });
        }
        nextPageToken = page.isLast === false ? page.nextPageToken : undefined;
      } while (nextPageToken);
      return out;
    },

    async create(user, i) {
      const created = await as(user).json('POST', '/rest/api/3/issue', {
        fields: {
          project: { key: jiraKey(i.project) },
          summary: i.summary,
          issuetype: { name: i.issueType },
          labels: i.labels,
          ...(i.assigneeId && { assignee: { accountId: i.assigneeId } }),
          ...(i.dueDate && { duedate: i.dueDate }),
        },
      });
      return { id: String(created.id), key: created.key };
    },

    async comment(user, key, text) {
      await as(user).json('POST', `/rest/api/3/issue/${key}/comment`, { body: adf(text) });
    },

    async transition(user, key, to) {
      const { transitions = [] } = await as(user).json('GET', `/rest/api/3/issue/${key}/transitions`);
      const t = transitions.find((x: any) => x?.to?.statusCategory?.key === STATUS_KEY[to]);
      if (!t) return false;
      await as(user).json('POST', `/rest/api/3/issue/${key}/transitions`, { transition: { id: t.id } });
      return true;
    },

    async assign(user, key, accountId) {
      await as(user).json('PUT', `/rest/api/3/issue/${key}/assignee`, { accountId });
    },
  };
};
