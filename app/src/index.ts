// Forge entry points: the app page's resolvers and the five Rovo/MCP actions.
// The logic lives in src/handover/service.ts and src/actions; this file only wires Forge in.
import * as ResolverModule from '@forge/resolver';
import { fetch } from '@forge/api';
import { randomUUID } from 'node:crypto';
import { Actions } from './actions';
import { forgeAtlassian } from './forge/atlassian';
import { KvsStore } from './forge/kvsStore';
import { callerFromAction, callerFromContext, findPeople, handoverLink, profileLink } from './forge/platform';
import { BatonError, HandoverService } from './handover/service';
import { createClient, type FetchLike } from './llm/client';
import { providersFromEnv } from './llm/models';
import type { Caller } from './types';

// Forge's bundler (CLI 14.2) double-wraps CJS default exports; unwrap whichever shape arrives.
const RM = ResolverModule as any;
const Resolver = RM.default?.default ?? RM.default ?? RM;

const LLM_CALLS_PER_HOUR = 20;

const service = () =>
  new HandoverService({
    store: new KvsStore(),
    llm: createClient({ fetch: fetch as unknown as FetchLike, providers: providersFromEnv() }),
    now: () => new Date().toISOString(),
    newId: randomUUID,
    llmCallsPerHour: LLM_CALLS_PER_HOUR,
    atlassian: forgeAtlassian,
  });

// ---- resolvers (app page) ----

type Handler = (svc: HandoverService, caller: Caller, payload: any) => Promise<unknown>;

const RESOLVERS: Record<string, Handler> = {
  listHandovers: (s, c, p) => s.list(c, { status: p?.status }),
  getHandover: (s, c, p) => s.get(c, p?.id),
  createHandover: (s, c, p) => s.create(c, p),
  saveInventory: (s, c, p) => s.saveInventory(c, p),
  summarizeItems: (s, c, p) => s.summarizeItems(c, p?.id),
  generateQuestions: (s, c, p) => s.generateQuestions(c, { id: p?.id, regenerate: !!p?.regenerate }),
  saveQuestions: (s, c, p) => s.saveQuestions(c, p),
  answerQuestion: (s, c, p) => s.answer(c, { id: p?.id, questionId: p?.questionId, answer: p?.answer }),
  finishAnswers: (s, c, p) => s.finishAnswers(c, p?.id),
  setOwner: (s, c, p) => s.setOwner(c, { id: p?.id, itemAri: p?.itemAri, accountId: p?.accountId ?? null }),
  generateSummary: (s, c, p) => s.generateSummary(c, { id: p?.id, regenerate: !!p?.regenerate }),
  updateSummary: (s, c, p) => s.updateSummary(c, p),
  markPublished: (s, c, p) => s.markPublished(c, { id: p?.id, pageId: p?.pageId, url: p?.url }),
  publishHandover: (s, c, p) => s.publish(c, p),
  reassignIssues: (s, c, p) => s.reassign(c, p),
  deleteAllHandovers: (s, c, p) => s.deleteAllHandovers(c, p),
};

/** Every resolver returns { ok: true, data } or { ok: false, error: { code, message } }. */
const resolver = new Resolver();
for (const [name, fn] of Object.entries(RESOLVERS)) {
  resolver.define(name, async ({ payload, context }: { payload: any; context: any }) => {
    try {
      const caller = await callerFromContext(context);
      if (!caller) return { ok: false, error: { code: 'not_found', message: 'Sign in to use Baton' } };
      return { ok: true, data: await fn(service(), caller, payload) };
    } catch (e) {
      if (e instanceof BatonError) return { ok: false, error: { code: e.code, message: e.message } };
      console.error(`${name} failed`, e instanceof Error ? e.message : e);
      return { ok: false, error: { code: 'internal', message: 'Something went wrong. Try again.' } };
    }
  });
}
export const handler = resolver.getDefinitions();

// ---- actions (Rovo agent and MCP tools) ----

const action =
  (name: keyof Pick<Actions, 'listHandovers' | 'getHandover' | 'findOwner' | 'listAtRiskItems' | 'startHandover'>) =>
  async (payload: any) => {
    // Never log the payload itself: it carries a signed contextToken.
    console.log(`${name} called`, JSON.stringify({ inputKeys: Object.keys(payload ?? {}) }));
    try {
      const caller = await callerFromAction(payload);
      if (!caller) return { error: 'Could not tell who is asking. Open Baton in Jira instead.' };
      const actions = new Actions(service(), { link: handoverLink, findPeople, profile: profileLink });
      return await actions[name](caller, payload ?? {});
    } catch (e) {
      console.error(`${name} failed`, e instanceof Error ? e.message : e);
      return { error: 'Baton hit an error. Try again, or open Baton in Jira.' };
    }
  };

export const listHandovers = action('listHandovers');
export const getHandover = action('getHandover');
export const findOwner = action('findOwner');
export const listAtRiskItems = action('listAtRiskItems');
export const startHandover = action('startHandover');
