import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Client } from '../llm/client';
import { generateQuestions, generateSummary, summarizeItems } from '../llm/tasks';
import { isWebUrl, pageBody, pageTitle } from '../publish/page';
import { applyIssueDetails, issueIdOf, type IssueDetails } from '../enrich/jira';
import { scoreInventory } from '../scoring/inventory';
import type { Caller, Handover, HandoverSummary, Item, Status } from '../types';
import { roleOf, subjectView, type Role } from './access';
import type { Store } from './store';

export type ErrorCode = 'not_found' | 'bad_input' | 'conflict' | 'llm_unavailable';

export class BatonError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Jira and Confluence calls made as the user. Kept behind a port so the service stays testable. */
export type AtlassianPort = {
  createPage(spaceKey: string, title: string, storageBody: string): Promise<{ pageId: string; url: string }>;
  assignIssue(issueKey: string, accountId: string): Promise<void>;
  /** Updated date and sprint end by Jira issue ID, which the graph doesn't return. Optional. */
  issueDetails?(issueIds: string[]): Promise<Record<string, IssueDetails>>;
};

export type ServiceDeps = {
  store: Store;
  llm: Client;
  now: () => string;
  newId: () => string;
  llmCallsPerHour: number;
  /** Only publish and reassign need it. */
  atlassian?: AtlassianPort;
};

export type ReassignResult = { ari: string; key: string; accountId: string; ok: boolean; error?: string };

const MAX_ANSWER = 5000;
const MAX_ITEMS = 500;

// ---- input schemas ----

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const id = z.string().trim().min(1);

const createInput = z.object({
  subjectAccountId: id,
  subjectName: id,
  reason: z.enum(['leaving', 'leave', 'team_change']),
  lastDay: isoDate,
  recipientAccountIds: z.array(id).default([]),
});

const itemInput = z.object({
  ari: id,
  kind: z.enum(['jira_issue', 'pull_request', 'confluence_page', 'goal', 'project']),
  title: z.string(),
  url: z.string().refine(isWebUrl, 'expected an http(s) URL'),
  key: z.string().optional(),
  status: z.string().optional(),
  statusCategory: z.enum(['todo', 'in_progress', 'done']).optional(),
  updatedAt: z.string().optional(),
  collaborators: z.array(z.string()),
  subjectRole: z.enum(['assignee', 'reporter', 'author', 'reviewer', 'owner', 'contributor']),
  container: z.string().optional(),
  reviewers: z.array(z.string()).optional(),
  dueDate: z.string().optional(),
  sprintEndDate: z.string().optional(),
  inboundLinks: z.number().optional(),
  unnamedOthers: z.number().int().min(0).max(100).optional(),
});

const inventoryInput = z.object({
  id,
  items: z.array(itemInput).max(MAX_ITEMS),
  teams: z.array(z.object({ name: z.string(), members: z.array(z.string()) })).default([]),
  openAssigned: z.record(z.number()).default({}),
  people: z.record(z.string()).default({}),
});

const questionsInput = z.object({
  id,
  questions: z.array(
    z.object({ id: z.string().optional(), text: z.string().trim().min(1).max(1000), itemAris: z.array(z.string()) }),
  ),
});

const summaryInput = z.object({
  id,
  summary: z.object({
    overview: z.string(),
    risks: z.array(z.string()),
    sections: z.array(
      z.object({ ownerAccountId: z.string().nullable(), body: z.string(), itemAris: z.array(z.string()) }),
    ),
  }),
});

const parse = <T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T => {
  const r = schema.safeParse(input);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
    throw new BatonError('bad_input', msg);
  }
  return r.data;
};

const sha256 = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const hourOf = (iso: string) => iso.slice(0, 13);

// ---- service ----

export class HandoverService {
  private llm: Client;

  constructor(private deps: ServiceDeps) {
    // Every LLM request, retries included, counts against a per-site hourly budget.
    this.llm = {
      complete: async (req) => {
        const used = await deps.store.increment(`llm-calls:${hourOf(deps.now())}`);
        if (used > deps.llmCallsPerHour) throw new Error('Hourly LLM limit reached');
        return deps.llm.complete(req);
      },
    };
  }

  private async load(caller: Caller, id: string, need: Role | 'any' = 'editor') {
    const h = await this.deps.store.get(id);
    const role = h && roleOf(h, caller);
    if (!h || !role || (need !== 'any' && role !== need)) throw new BatonError('not_found', 'Handover not found');
    return { h, role };
  }

  private async save(h: Handover) {
    h.updatedAt = this.deps.now();
    await this.deps.store.put(h);
    return h;
  }

  async create(caller: Caller, input: unknown): Promise<Handover> {
    const i = parse(createInput, input);
    if (i.subjectAccountId === caller.accountId) {
      throw new BatonError('bad_input', 'Someone else, usually your manager, has to start your handover');
    }
    const now = this.deps.now();
    const h: Handover = {
      id: this.deps.newId(),
      ...i,
      recipientAccountIds: i.recipientAccountIds.filter((r) => r !== i.subjectAccountId),
      subjectAri: `ari:cloud:identity::user/${i.subjectAccountId}`,
      initiatorAccountId: caller.accountId,
      status: 'draft',
      items: [],
      people: { [i.subjectAccountId]: i.subjectName },
      questions: [],
      inputHash: '',
      generatedFrom: {},
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.store.put(h);
    return h;
  }

  /** Handovers the caller can see, newest first. */
  async list(caller: Caller, filter: { status?: Status } = {}) {
    const all = caller.isAdmin
      ? await this.deps.store.listAll()
      : await this.deps.store.listForAccount(caller.accountId);
    return all
      .map((h) => ({ h, role: roleOf(h, caller) }))
      .filter((x): x is { h: Handover; role: Role } => !!x.role && (!filter.status || x.h.status === filter.status))
      .sort((a, b) => b.h.createdAt.localeCompare(a.h.createdAt))
      .map(({ h, role }) => ({
        id: h.id,
        subjectAccountId: h.subjectAccountId,
        subjectName: h.subjectName,
        reason: h.reason,
        lastDay: h.lastDay,
        status: h.status,
        role,
        itemCount: h.items.length,
        highCount: h.items.filter((i) => i.band === 'high').length,
        questionCount: h.questions.length,
        answeredCount: h.questions.filter((q) => q.answer?.trim()).length,
        updatedAt: h.updatedAt,
      }));
  }

  /** Full handover for editors; only their own questions for the subject. */
  async get(caller: Caller, id: string) {
    const { h, role } = await this.load(caller, id, 'any');
    return role === 'editor' ? { role, handover: h } : subjectView(h);
  }

  /** Full handovers the caller may edit, for the Rovo and MCP actions. */
  async listEditable(caller: Caller) {
    const all = caller.isAdmin
      ? await this.deps.store.listAll()
      : await this.deps.store.listForAccount(caller.accountId);
    return all.filter((h) => roleOf(h, caller) === 'editor');
  }

  async saveInventory(caller: Caller, input: unknown): Promise<Handover> {
    const i = parse(inventoryInput, input);
    const { h } = await this.load(caller, i.id);
    if (h.status === 'published') throw new BatonError('conflict', 'This handover is already published');

    h.people = { ...h.people, ...i.people };
    const items = await this.withIssueDetails(i.items);
    const accepted = new Map(h.items.map((x) => [x.ari, x.acceptedOwnerAccountId]));
    const oneLines = new Map(h.items.map((x) => [x.ari, x.oneLine]));
    h.items = scoreInventory(items, {
      subjectAri: h.subjectAri,
      subjectName: h.subjectName,
      lastDay: h.lastDay,
      now: this.deps.now(),
      teams: i.teams,
      openAssigned: i.openAssigned,
    }).map((x) => ({
      ...x,
      ...(accepted.get(x.ari) && { acceptedOwnerAccountId: accepted.get(x.ari) }),
      ...(oneLines.get(x.ari) && { oneLine: oneLines.get(x.ari) }),
    }));
    h.inputHash = sha256(h.items.map((x) => [x.ari, x.title, x.status, x.risk, x.reasons]));
    return this.save(h);
  }

  /** Fills Jira dates the graph lacks. Never blocks saving: on failure the graph data is used as is. */
  private async withIssueDetails(items: Item[]): Promise<Item[]> {
    const lookup = this.deps.atlassian?.issueDetails;
    const ids = [...new Set(items.filter((x) => x.kind === 'jira_issue').map((x) => issueIdOf(x.ari)).filter((x): x is string => !!x))];
    if (!lookup || ids.length === 0) return items;
    try {
      return applyIssueDetails(items, await lookup.call(this.deps.atlassian, ids));
    } catch (e) {
      console.warn('Jira issue details failed; scoring without them', e instanceof Error ? e.message : e);
      return items;
    }
  }

  async summarizeItems(caller: Caller, id: string): Promise<Handover> {
    const { h } = await this.load(caller, id);
    if (h.generatedFrom.oneLines === h.inputHash) return h;
    const lines = await summarizeItems(this.llm, h);
    h.items = h.items.map((x) => (lines[x.ari] ? { ...x, oneLine: lines[x.ari] } : x));
    if (Object.keys(lines).length > 0) h.generatedFrom.oneLines = h.inputHash;
    return this.save(h);
  }

  async generateQuestions(caller: Caller, input: { id: string; regenerate?: boolean }): Promise<Handover> {
    const { h } = await this.load(caller, input.id);
    if (!input.regenerate && h.questions.length > 0 && h.generatedFrom.questions === h.inputHash) return h;

    const questions = await generateQuestions(this.llm, h);
    if (!questions) throw new BatonError('llm_unavailable', 'Could not generate questions. Try again, or write them yourself.');
    const answers = new Map(h.questions.filter((q) => q.answer).map((q) => [q.text, q.answer]));
    h.questions = questions.map((q) => (answers.has(q.text) ? { ...q, answer: answers.get(q.text) } : q));
    h.generatedFrom.questions = h.inputHash;
    if (h.status === 'draft') h.status = 'collecting';
    return this.save(h);
  }

  async saveQuestions(caller: Caller, input: unknown): Promise<Handover> {
    const i = parse(questionsInput, input);
    const { h } = await this.load(caller, i.id);
    const known = new Set(h.items.map((x) => x.ari));
    const old = new Map(h.questions.map((q) => [q.id, q]));
    let next = Math.max(0, ...h.questions.map((q) => Number(q.id.replace(/^q/, '')) || 0));

    h.questions = i.questions.map((q) => {
      const prev = q.id ? old.get(q.id) : undefined;
      return {
        id: prev ? prev.id : `q${++next}`,
        text: q.text,
        itemAris: q.itemAris.filter((a) => known.has(a)),
        ...(prev?.answer && { answer: prev.answer }),
      };
    });
    if (h.status === 'draft' && h.questions.length > 0) h.status = 'collecting';
    return this.save(h);
  }

  async answer(caller: Caller, input: { id: string; questionId: string; answer: string }) {
    const { h } = await this.load(caller, input.id, 'subject');
    const q = h.questions.find((x) => x.id === input.questionId);
    if (!q) throw new BatonError('bad_input', 'No such question');
    if (typeof input.answer !== 'string' || input.answer.length > MAX_ANSWER) {
      throw new BatonError('bad_input', `Answers can be up to ${MAX_ANSWER} characters`);
    }
    q.answer = input.answer;
    return subjectView(await this.save(h));
  }

  async finishAnswers(caller: Caller, id: string) {
    const { h } = await this.load(caller, id, 'subject');
    if (h.status !== 'collecting') throw new BatonError('conflict', 'This handover is not waiting for answers');
    h.status = 'ready';
    return subjectView(await this.save(h));
  }

  async setOwner(caller: Caller, input: { id: string; itemAri: string; accountId: string | null }) {
    const { h } = await this.load(caller, input.id);
    const item = h.items.find((x) => x.ari === input.itemAri);
    if (!item) throw new BatonError('bad_input', 'No such item in this handover');
    if (input.accountId) item.acceptedOwnerAccountId = input.accountId;
    else delete item.acceptedOwnerAccountId;
    return this.save(h);
  }

  async generateSummary(caller: Caller, input: { id: string; regenerate?: boolean }): Promise<Handover> {
    const { h } = await this.load(caller, input.id);
    // Owners and answers change the narrative, so they are part of its cache key.
    const key = sha256([
      h.inputHash,
      h.items.map((x) => x.acceptedOwnerAccountId ?? null),
      h.questions.map((q) => [q.text, q.answer ?? null]),
    ]);
    if (!input.regenerate && h.summary && h.generatedFrom.summary === key) return h;

    const summary = await generateSummary(this.llm, h);
    if (!summary) throw new BatonError('llm_unavailable', 'Could not generate the summary. Try again in a minute.');
    h.summary = summary;
    h.generatedFrom.summary = key;
    return this.save(h);
  }

  async updateSummary(caller: Caller, input: unknown): Promise<Handover> {
    const i = parse(summaryInput, input);
    const { h } = await this.load(caller, i.id);
    h.summary = i.summary as HandoverSummary;
    return this.save(h);
  }

  /** Called by the publish flow once the Confluence page exists. */
  async markPublished(caller: Caller, input: { id: string; pageId: string; url: string }): Promise<Handover> {
    const { h } = await this.load(caller, input.id);
    h.status = 'published';
    h.confluencePageId = input.pageId;
    h.confluencePageUrl = input.url;
    return this.save(h);
  }

  /**
   * Deletes one handover: the person who started it, or a Jira admin. Recipients can see it but not
   * delete it. A Confluence page it published is left alone.
   */
  async deleteHandover(caller: Caller, input: unknown): Promise<{ deleted: string }> {
    const id = (input as { id?: unknown } | null)?.id;
    const { h } = await this.load(caller, typeof id === 'string' ? id : '');
    if (!caller.isAdmin && caller.accountId !== h.initiatorAccountId) {
      throw new BatonError('bad_input', 'Only the person who started this handover, or a Jira admin, can delete it');
    }
    await this.deps.store.delete(h.id);
    return { deleted: h.id };
  }

  /** Jira admins only, for resetting a demo site. Returns how many were deleted. */
  async deleteAllHandovers(caller: Caller, input: unknown): Promise<{ deleted: number }> {
    if (!caller.isAdmin) throw new BatonError('not_found', 'Handover not found');
    if ((input as { confirm?: unknown } | null)?.confirm !== 'DELETE') {
      throw new BatonError('bad_input', 'Pass { "confirm": "DELETE" } to delete every handover on this site');
    }
    const all = await this.deps.store.listAll();
    for (const h of all) await this.deps.store.delete(h.id);
    return { deleted: all.length };
  }

  private port(): AtlassianPort {
    if (!this.deps.atlassian) throw new Error('Jira/Confluence access is not configured');
    return this.deps.atlassian;
  }

  /** Creates the Confluence page as the user, then marks the handover published. */
  async publish(caller: Caller, input: unknown): Promise<Handover> {
    const i = parse(z.object({ id, spaceKey: z.string().trim().regex(/^[A-Za-z0-9~]+$/, 'expected a space key') }), input);
    const { h } = await this.load(caller, i.id);
    if (h.status === 'published') throw new BatonError('conflict', 'This handover is already published');
    if (!h.summary) throw new BatonError('conflict', 'Generate the handover summary before publishing');
    const page = await this.port().createPage(i.spaceKey, pageTitle(h), pageBody(h));
    h.status = 'published';
    h.confluencePageId = page.pageId;
    h.confluencePageUrl = page.url;
    return this.save(h);
  }

  /**
   * Assigns the chosen Jira issues to their accepted owners, as the user. The UI shows a confirmation
   * dialog listing every change first. One failure doesn't stop the rest; each result says what happened.
   */
  async reassign(caller: Caller, input: unknown): Promise<{ results: ReassignResult[] }> {
    const i = parse(z.object({ id, itemAris: z.array(id).min(1).max(MAX_ITEMS) }), input);
    const { h } = await this.load(caller, i.id);
    const byAri = new Map(h.items.map((x) => [x.ari, x]));
    const results: ReassignResult[] = [];
    for (const ari of i.itemAris) {
      const x = byAri.get(ari);
      if (!x) throw new BatonError('bad_input', `No such item in this handover: ${ari}`);
      if (x.kind !== 'jira_issue' || !x.key) throw new BatonError('bad_input', `Only Jira issues can be reassigned: ${x.title}`);
      if (!x.acceptedOwnerAccountId) throw new BatonError('bad_input', `Pick a new owner first: ${x.key}`);
      try {
        await this.port().assignIssue(x.key, x.acceptedOwnerAccountId);
        results.push({ ari, key: x.key, accountId: x.acceptedOwnerAccountId, ok: true });
      } catch (e) {
        results.push({ ari, key: x.key, accountId: x.acceptedOwnerAccountId, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { results };
  }
}
