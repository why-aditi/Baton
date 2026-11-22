// Fills in what Teamwork Graph doesn't return for Jira issues: the updated date (for the "stale"
// risk signal) and the sprint end (for "due soon after they leave"). The REST calls live in
// src/forge/atlassian.ts; this file only parses their responses.
import type { Item } from '../types';

export type IssueDetails = { updatedAt?: string; sprintEndDate?: string };

const SPRINT_SCHEMA = 'com.pyxis.greenhopper.jira:gh-sprint';

/** The numeric issue ID inside a Jira issue ARI (…:issue/66400), which is the REST issue ID. */
export const issueIdOf = (ari: string) => ari.match(/^ari:cloud:jira:[^:]*:issue\/(\d+)$/)?.[1];

/** The Sprint field's ID varies by site (often customfield_10020); find it by its schema. */
export const sprintFieldId = (fields: unknown): string | undefined =>
  Array.isArray(fields) ? fields.find((f) => f?.schema?.custom === SPRINT_SCHEMA)?.id : undefined;

/** Jira writes offsets as +0000; make them ISO before parsing. */
const toIso = (s: unknown) => {
  if (typeof s !== 'string') return undefined;
  const t = Date.parse(s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
};

/** The active sprint's end, else the earliest future sprint's. Closed sprints don't count. */
const sprintEnd = (sprints: unknown) => {
  if (!Array.isArray(sprints)) return undefined;
  const ends = (state: string) =>
    sprints
      .filter((s) => s?.state === state)
      .map((s) => toIso(s.endDate))
      .filter((d): d is string => !!d)
      .sort();
  return (ends('active')[0] ?? ends('future')[0])?.slice(0, 10);
};

/** Parses a /rest/api/3/search/jql response into details by issue ID. */
export const issueDetails = (search: any, sprintField: string | undefined): Record<string, IssueDetails> => {
  const out: Record<string, IssueDetails> = {};
  for (const issue of search?.issues ?? []) {
    if (!issue?.id) continue;
    const d: IssueDetails = {};
    const updatedAt = toIso(issue.fields?.updated);
    if (updatedAt) d.updatedAt = updatedAt;
    const end = sprintField ? sprintEnd(issue.fields?.[sprintField]) : undefined;
    if (end) d.sprintEndDate = end;
    out[String(issue.id)] = d;
  }
  return out;
};

/** Adds the details to matching Jira items, never overwriting what the graph provided. */
export const applyIssueDetails = (items: Item[], details: Record<string, IssueDetails>): Item[] =>
  items.map((item) => {
    const id = item.kind === 'jira_issue' ? issueIdOf(item.ari) : undefined;
    const d = id ? details[id] : undefined;
    if (!d) return item;
    return {
      ...item,
      ...(!item.updatedAt && d.updatedAt && { updatedAt: d.updatedAt }),
      ...(!item.sprintEndDate && d.sprintEndDate && { sprintEndDate: d.sprintEndDate }),
    };
  });
