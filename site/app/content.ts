// Everything the page says that comes from the product. Keep it in step with the app:
// scoring weights with app/src/scoring/risk.ts, tools with app/manifest.yml (rovo:action inputs).

/** Example rows from the Northwind Pay demo (scripts/seed/story.ts), shown in the hero. */
export const exampleRows = [
  { score: 75, title: 'Exponential backoff for card declines', why: 'only Meera · mid-flight · due after', to: 'Arjun' },
  { score: 60, title: 'PR #1 jittered backoff in retry worker', why: 'only Meera · open', to: 'Arjun' },
  { score: 60, title: 'PR #2 retry thresholds to config', why: 'only Meera · open', to: 'Lin' },
  { score: 60, title: 'DLQ replay tool for failed retries', why: 'only Meera · mid-flight', to: 'Dana' },
  { score: 60, title: 'Retry service memory limits', why: 'only Meera · mid-flight', to: 'Sam' },
  { score: 55, title: 'Payment retry service runbook', why: 'only Meera · 4 inbound links', to: 'Dana' },
];

/** The knowledge-risk signals and their points (app/src/scoring/risk.ts). */
export const rules = [
  { signal: 'Nobody else has worked on it', points: 40 },
  { signal: 'Only one other person has context', points: 20 },
  { signal: 'Work is mid-flight', points: 20 },
  { signal: 'Due before, or within a week after, the last day', points: 15 },
  { signal: 'Open PR whose only reviewer is them', points: 15 },
  { signal: 'Page linked from 3 or more other pages', points: 15 },
  { signal: 'Open and untouched for 30+ days', points: 10 },
];

/** The five Rovo and MCP actions, with their inputs (? = optional). */
export const tools = [
  ['list-handovers', '{ status? }'],
  ['get-handover', '{ person }'],
  ['find-owner', '{ item: "PAY-1" }'],
  ['list-at-risk-items', '{ person?, minRisk: 60 }'],
  ['start-handover', '{ person, reason, lastDay }'],
] as const;

export const steps = [
  {
    title: 'Build the inventory',
    body: 'Pick the person and their last day. Baton reads their open Jira issues, pull requests, pages and goals through Teamwork Graph, as you, and scores every item from 0 to 100.',
  },
  {
    title: 'Ask what isn’t written down',
    body: 'Baton drafts questions about the riskiest items. The person leaving answers them in one screen, and each answer stays attached to the work it explains.',
  },
  {
    title: 'Publish and reassign',
    body: 'Publish the handover to Confluence with new owners @mentioned, then reassign the Jira issues after a dialog that lists every change.',
  },
];

export const facts = [
  { title: 'Teamwork Graph', body: 'Reads Jira, Bitbucket, Confluence and Goals in one pass, with the signed-in user’s permissions.' },
  { title: 'Forge storage', body: 'Handovers stay on your Atlassian site. Nothing is kept on outside servers.' },
  { title: 'Pseudonymized prompts', body: 'People become P1, P2 before any text reaches the language model, and come back after.' },
  { title: 'Works without the LLM', body: 'If the model is down, the scored inventory, owners and reassignments still work.' },
];
