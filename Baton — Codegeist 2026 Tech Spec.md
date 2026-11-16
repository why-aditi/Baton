# Baton — Codegeist 2026 Tech Spec

Nov 16, 2026 · @Aditi

## Overview

Baton turns a departing teammate's scattered work into a ranked handover in minutes. It finds every open item they own, flags what nobody else understands, suggests who should take it, and captures their unwritten knowledge before their last day.

**Problem.** When someone leaves, goes on leave or changes teams, their context leaves with them. Open Jira work goes stale, PRs sit unreviewed, and pages only they maintained rot. Managers rebuild this by hand from memory, usually after the person is gone.

**Who it's for**

- **Manager or lead (primary):** starts the handover, assigns new owners, publishes the page.
- **Departing person:** answers a short set of generated questions about tacit knowledge.
- **Recipients:** read the published handover, or ask the Baton agent in Rovo.

**What makes it different:** it doesn't just list items. It scores each one for knowledge risk ("only this person has touched it") and generates targeted questions, so the tacit part gets written down.

**Codegeist 2026 entry:** Business Teams category (see Open questions), targeting the Best Agents, Atlassian MCP and Teamwork Graph bonus prizes. Submission deadline is Dec 22, 2026, 12:00 PM PST (Dec 23, 1:30 AM IST).

**Success criteria, mapped to the five equally weighted judging criteria**

| Criterion | What we must show |
| --- | --- |
| Technological Implementation | Real Teamwork Graph queries across Jira, Bitbucket and Confluence; deterministic risk and owner scoring; working Rovo agent and MCP tools; installs cleanly on a fresh site |
| Design | Feels native to Jira (Atlassian Design System), with a complete flow from start to published page and no dead ends |
| Potential Impact | A concrete, common pain point with a time-saved story (rebuilding a handover by hand takes hours, Baton takes minutes) |
| Innovation | Knowledge-risk scoring and generated tacit-knowledge questions, not just an AI summary |
| Presentation | A video under 5 minutes, with a real story (Aditi's LifeStation handover), the full flow end to end, and every bonus feature shown |

## Scope

The MVP is one complete flow: start a handover, see the risk-ranked inventory, assign owners, capture the person's knowledge, publish. Everything else waits until the MVP is solid and polished.

**MVP (must ship by the Dec 14 feature freeze)**

1. **Start handover:** pick a person, a reason (leaving, leave, team change), their last day and the default recipient.
2. **Inventory:** gather their open Jira work, Bitbucket PRs they created or are reviewing, Confluence pages they own, teams, goals and projects from Teamwork Graph.
3. **Knowledge-risk scoring:** a deterministic 0–100 score per item, with plain-language reasons ("no other contributor", "PR has no other reviewer").
4. **Owner suggestions:** the top 3 candidates per item, ranked from team membership and co-contribution, with a reason for each.
5. **Knowledge capture:** the LLM writes 5–10 targeted questions from the highest-risk items, and the departing person answers them in a form.
6. **Publish:** generate the handover summary and create a Confluence page (fall back to an in-app page if the cross-product spike fails).
7. **Reassign:** bulk-reassign selected Jira issues to accepted owners, with a confirmation step.
8. **Rovo agent "Baton":** answers questions about a handover and can start one.
9. **MCP tools:** the same actions exposed through `rovo:mcp`.

**Stretch (only after the MVP is polished)**

- Marketplace listing (free) for the Marketplace bonus prize
- A Jira issue panel badge: "This issue is in an open handover"
- Writing handover relationships back into Teamwork Graph
- Re-running a handover to show what changed since it was published

**Out of scope**

- HR system integrations (Workday and similar)
- Bitbucket repository ownership or code-level analysis
- Automatic reassignment without a human approving it
- Anything using PlayPower code, data or Atlassian sites

## Architecture

Baton is one Forge app installed into Jira. It reads Teamwork Graph from the frontend as the signed-in user, scores in backend resolvers, calls Forge LLMs only for language tasks, and keeps all data on Atlassian (Runs on Atlassian, no egress).

&#91;embedded content: Baton architecture · 3 entry points, 1 platform\]

The app page reads the graph directly. The resolvers and the five shared actions use Forge LLMs, storage and Jira/Confluence REST, all inside Atlassian.

**Key design decisions**

- **Graph reads happen in the frontend.** `requestTeamworkGraph` exists only on `asUser()`, and frontend bridge calls always run as the current user. Paging through results in the UI also avoids backend function timeouts.
- **Scoring is deterministic code, not the LLM.** Risk and owner ranking are pure, unit-tested TypeScript functions. That's more defensible for Technical Implementation, cheaper and repeatable.
- **The LLM only writes language**: per-item summaries, questions, and the handover narrative. It always receives scored items as JSON, and its output is validated against a schema.
- **No egress.** Forge LLMs plus Forge storage keep the app eligible for Runs on Atlassian. This matters to judges, who rewarded platform-native apps last year.

**Forge modules (manifest)**

| Module | Key | Purpose |
| --- | --- | --- |
| `jira:globalPage` | `baton-home` | Main app: handover list, wizard, inventory, publish |
| `function` + `resolver` | `baton-resolver` | Scoring, storage, LLM calls, Jira and Confluence REST |
| `rovo:agent` | `baton-agent` | Chat agent in Rovo that answers handover questions and starts handovers |
| `action` (×5) | see Agent section | Shared by the Rovo agent and the MCP server |
| `rovo:mcp` | `baton-mcp` | Exposes the actions as MCP tools (one module per app, at most 50 actions) |
| `llm` | — | Forge LLMs (Claude models hosted on Atlassian); adding it forces a major version |
| `jira:issuePanel` | `baton-issue-badge` | Stretch: "in an open handover" badge |

**Stack**

- Custom UI: React + TypeScript + `@atlaskit` (Atlassian Design System) components
- Backend: Node/TypeScript Forge functions, `@forge/api`, `@forge/llm`, `@forge/kvs`
- Tests: Vitest for unit tests, Claude in Chrome for end-to-end
- Repo: GitHub, private until submission

## Teamwork Graph queries

Most of the inventory comes from curated queries, which need no registration. Pages a person owns and co-contributors need persisted Cypher queries, because no curated query starts from a user and returns pages ([curated queries](https://developer.atlassian.com/platform/teamwork-graph/curated-queries/)).

**Curated queries (no registration)**

| Query | Used for | Arguments |
| --- | --- | --- |
| `atlassianUserAssignedJiraWorkItems` | Open Jira work the person owns | `userId` |
| `atlassianUserReportedJiraWorkItems` | Issues they raised that are still open | `userId` |
| `atlassianUserPullRequests` | PRs they created or are reviewing | `userId`, `roles`, `since: P90D` |
| `atlassianUserInTeams` | Their teams (candidate pool for owners) | `userId` |
| `atlassianTeamMembers` | Teammates per team | `teamAri` |
| `atlassianUserGoalsAndProjects` | Goals and projects they own or contribute to | `userId`, `roles` |
| `confluencePageContributors` | Other contributors per page (bus factor) | page `id` |
| `jiraWorkItemComments` | Who else engaged on an issue | issue `id` |

**Persisted Cypher queries (register in TWG Labs during week 1)**

- `PQ_USER_OWNED_PAGES`: Confluence pages where the person is creator or owner. Exact relationship names to be confirmed in the Query Builder.
- `PQ_ITEM_COLLABORATORS`: for a set of item ARIs, the other users linked to each one (commenters, reviewers, contributors). Used for owner ranking.

**Constraints that shape the code**

- `first` is capped at 25, so every query paginates with `pageInfo.endCursor`. Budget about 10 pages per person.
- IDs are ARIs. A user's ARI is `ari:cloud:identity::user/{accountId}`.
- Persisted queries are immutable and owned by the app ID. Any change means a new key, stored in `src/graph/queryKeys.ts`. Judges install the same app ID, so the keys work for them too.
- Results are filtered by the calling user's permissions, so a handover must be run by someone who can see the person's work, usually their manager. The UI shows a note about this.
- Missing scopes don't produce errors: the query succeeds but silently drops the unreadable data. We add a startup self-check that warns when a known item type comes back empty.
- Execution errors return HTTP 200 with `data` null, so the client checks `errors[].extensions.code` and retries on `QUERY_NOT_FOUND` (new queries take about a minute to propagate).

**Normalized item shape (frontend → backend)**

```ts
type Item = {
  ari: string;
  kind: 'jira_issue' | 'pull_request' | 'confluence_page' | 'goal' | 'project';
  title: string; url: string; status?: string;
  updatedAt?: string;
  collaborators: string[];   // other user ARIs linked to the item
  subjectRole: 'assignee' | 'reporter' | 'author' | 'reviewer' | 'owner' | 'contributor';
};
```

## Core flows

The handover moves through four states: Draft, then Collecting (waiting for the departing person's answers), then Ready, then Published. Each state has one screen.

**Flow 1: Build the inventory (Draft)**

1. The manager opens Baton, clicks "New handover", picks the person, the reason, their last day and a default recipient.
2. The frontend runs every query in the Teamwork Graph section in parallel, paginates, and normalizes the results into `Item[]`. A progress bar shows each source.
3. The frontend sends `Item[]` to the `scoreInventory` resolver, which returns scored items and owner suggestions.
4. The results are saved to storage as a `Handover` record and the Inventory screen renders, sorted by risk.

**Knowledge-risk score** (0–100, clamped; weights to be tuned on seed data in week 2)

| Signal | Points | Reason shown to the user |
| --- | --- | --- |
| No collaborators other than the person | +40 | "Only {name} has worked on this" |
| Exactly one other collaborator | +20 | "Only one other person has context" |
| Status is in progress, or the PR is open | +20 | "Work is mid-flight" |
| Person is the only reviewer on an open PR | +15 | "No other reviewer" |
| Not updated in the last 30 days but still open | +10 | "Stale, so context is likely only in their head" |
| Page they own that has been linked from 3+ other pages | +15 | "Widely referenced page" |
| Due date or sprint ends before or within 7 days after their last day | +15 | "Due soon after they leave" |

The score is banded High (60+), Medium (30–59) or Low (under 30). Every point added comes with a reason string, so the UI can say why an item is risky.

**Owner ranking**, for each item and each candidate (teammates plus anyone who collaborated on the item):

```latex
\text{score}(c) = 3\cdot\text{coContrib}(c, \text{item}) + 2\cdot\text{sameTeam}(c) + 1\cdot\text{coContrib}(c, \text{sameProject}) - 2\cdot\text{load}(c)
```

`load` is the candidate's open assigned items divided by 10, capped at 2, so already overloaded people sink in the ranking. The top 3 are shown, each with a reason ("reviewed 2 of Meera's PRs").

**Flow 2: Capture knowledge (Collecting)**

1. The manager clicks "Ask {name}". The `generateQuestions` resolver sends the top 15 high-risk items to the LLM, which returns 5–10 questions, each tied to item ARIs.
2. The manager can edit or delete questions, then shares a link to the Baton page. The departing person sees only their questions.
3. Answers autosave. When the person clicks "Done", the handover moves to Ready.

**Flow 3: Publish (Ready → Published)**

1. The manager accepts or overrides the suggested owner per item.
2. `generateSummary` writes the narrative: an overview, the risks, and a per-owner section that folds in the person's answers.
3. `publishHandover` creates a Confluence page from the narrative, links every item, and mentions the new owners. If the cross-product spike fails, the page lives inside Baton instead.
4. Optionally, `reassignIssues` bulk-reassigns the selected Jira issues as the manager, after a confirmation dialog listing every change.

## Rovo agent, actions and MCP tools

Five actions do all the work. The `baton-agent` Rovo agent uses them, and the `baton-mcp` module exposes the same five as MCP tools. One set of handlers counts toward two bonus prizes.

**Actions**

| Action key | Verb | Inputs | Returns |
| --- | --- | --- | --- |
| `list-handovers` | GET | `status?` | Handovers the caller can see: person, reason, last day, status, link |
| `get-handover` | GET | `person` (name or account ID) | Summary, the top 10 risky items, owners, answered questions |
| `find-owner` | GET | `item` (issue key, PR URL or page title) | Current owner, accepted new owner and reason, or "not in a handover" |
| `list-at-risk-items` | GET | `person`, `minRisk?` (default 60) | High-risk items with reasons |
| `start-handover` | CREATE | `person`, `reason`, `lastDay` | A draft handover and a link to finish it in Baton (the inventory builds in the UI) |

Each handler validates its inputs, checks that the caller can see the handover (initiator, recipient, subject or a Jira admin), and returns compact JSON under 4 KB so agents stay fast.

**Rovo agent (`baton-agent`)**

- **Name:** Baton. **Description:** "Answers questions about team handovers: what someone left unfinished, who owns it now, and what's at risk."
- **Prompt rules:** always call an action before answering; never invent items or owners; cite issue keys and page titles as links; if no handover exists, offer to start one.
- **Conversation starters:** "What did Meera leave unfinished?", "Who owns PAY-142 now?", "Start a handover for Arjun, last day Jan 10", "What's high-risk in open handovers?"

**MCP server (`baton-mcp`)**

- `tools`: the five action keys above. The name "Baton handovers" fits the 30-character limit.
- **Demo in the video:** an admin enables external exposure (Atlassian Administration → Apps → Sites → Connected apps), then Claude Desktop connects to `https://mcp.atlassian.com/forge/<appId>`, consents, and asks "Who owns PAY-142 now?"
- Tools only run within the invoking user's own permissions, so the permission check is the same as for the agent.

**Verify in week 1:** the current `rovo:agent` manifest fields, and whether `rovo:skill` is available. If it is, wrap `get-handover` and `find-owner` as reusable skills, which the Best Agents bonus explicitly mentions.

## LLM usage

Three LLM calls per handover, all through Forge LLMs, with every output in JSON validated against a schema. A typical handover should use about 3 calls and well under 50k tokens. That matters because Forge LLMs bills from the first token, with no free tier ([pricing](https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-api-pricing/)).

| Call | Model tier | Input | Output schema | When |
| --- | --- | --- | --- | --- |
| `generateQuestions` | Mid (Sonnet-class) | Top 15 items by risk: title, kind, status, risk reasons, collaborator count | `{questions: [{id, text, itemAris[]}]}`, 5–10 questions | "Ask {name}" clicked |
| `summarizeItems` | Small (Haiku-class) | Batches of 10 items | `{items: [{ari, oneLine}]}` | After scoring, only for High and Medium items |
| `generateSummary` | Mid (Sonnet-class) | Scored items, accepted owners, Q&A answers | `{overview, risks[], sections: [{ownerAri, body, itemAris[]}]}` | "Generate handover" clicked |

The model IDs come from the Forge LLMs model list, checked in week 1 and kept in `src/llm/models.ts`.

**Grounding and anti-hallucination**

- The system prompt says to use only the provided items and never invent issue keys, people or dates.
- Every `itemAris` value in the output must exist in the input. Unknown ARIs are stripped, and if more than 20% are unknown the call is retried once with an error message. This is the same idea as Ghost Town's anti-bleed validator.
- Questions must be answerable by the departing person: concrete ("Where are the staging credentials for the payments retry job documented?"), not generic ("Any tips?").

**Cost and latency controls**

- Results are cached on the `Handover` record, keyed by a hash of the input items. Nothing is regenerated unless the inventory changes.
- Input is capped at the top 15 items for questions and 60 items for the summary. Long descriptions are cut to 500 characters.
- If a call fails, the UI shows the deterministic inventory anyway. The LLM output is an enhancement and never blocks the flow.

## UI

Five screens in one Jira global page, built with Atlassian Design System components so the app looks native. Design counts for 20% of the score, so every screen gets empty, loading and error states.

| Screen | Who | Main content | Primary action |
| --- | --- | --- | --- |
| Handovers | Manager | Table of handovers: person, reason, last day, status lozenge, progress | New handover |
| New handover | Manager | Person picker, reason, last-day date picker, default recipient | Build inventory |
| Inventory | Manager | Risk-sorted list grouped by High, Medium and Low; each row shows type icon, title, reason chips and an owner select pre-filled with the top suggestion | Ask {name} / Generate handover |
| Knowledge capture | Departing person | Their questions, each with linked items and an autosaving text area; progress "4 of 7 answered" | Done |
| Review and publish | Manager | Generated summary (editable), owner sections, Q&A, the list of reassignments | Publish to Confluence / Reassign issues |

**Design details that score points**

- A header stat strip on Inventory: total items, High-risk count, items without an owner, days until last day.
- Risk reasons as chips ("Only Meera", "Mid-flight", "Due after last day") so the score is explained at a glance.
- A Teamwork Graph source tag per item (Jira, Bitbucket, Confluence, Goals), which shows the cross-product reach in the video.
- Empty states that teach: "No open work found. Check that Baton's graph scopes are granted" links to the admin page.
- A confirmation dialog before reassigning, listing every change, matching judges' interest in governance.
- Light and dark themes come free with ADS tokens. Test both.

## Storage, data model and permissions

All state lives in Forge storage (KVS custom entities), so no data leaves Atlassian. One `Handover` entity holds everything, including items and answers.

```ts
type Handover = {
  id: string;                 // uuid
  subjectAri: string;         // departing person
  initiatorAccountId: string; // manager
  recipientAccountIds: string[];
  reason: 'leaving' | 'leave' | 'team_change';
  lastDay: string;            // ISO date
  status: 'draft' | 'collecting' | 'ready' | 'published';
  items: ScoredItem[];
  questions: { id: string; text: string; itemAris: string[]; answer?: string }[];
  summary?: { overview: string; risks: string[]; sections: Section[] };
  inputHash: string;          // LLM cache key
  confluencePageId?: string;
  createdAt: string; updatedAt: string;
};

type ScoredItem = Item & {
  risk: number; band: 'high' | 'medium' | 'low'; reasons: string[];
  suggestions: { accountId: string; score: number; reason: string }[];
  acceptedOwnerAccountId?: string;
};
```

**Indexes:** by `initiatorAccountId`, `subjectAri` and `status`. If a handover has more than 150 items, split them into a separate entity, because storage values have size limits (check the current limit in week 1).

**Access rules (enforced in every resolver and action)**

- **Initiator, recipients and Jira admins:** read and edit.
- **Subject (departing person):** read and answer their own questions only.
- **Everyone else:** no access. Actions return "not found", so they don't reveal that a handover exists.

**Manifest scopes (exact names to confirm on the Scopes page)**

- Teamwork Graph: `read:graph:user:atlassian`, `read:graph:team:atlassian`, plus one read scope per object type queried (Jira work item, pull request, Confluence page, goal, project). A missing scope silently drops data.
- Jira: `read:jira-work`, `write:jira-work` (reassign), `read:jira-user`.
- Confluence: page read and write scopes (only if the cross-product publish spike succeeds).
- `storage:app` and the `llm` module.

**Install note for judges:** installing an app with Teamwork Graph scopes requires organization admin permissions ([limitations](https://developer.atlassian.com/platform/teamwork-graph/limitations-and-considerations/)). Say this clearly in the install instructions.

## Seed data and demo environment

The demo is only as good as its data, so the seed is a scripted fake company with a story. It must be in place by the end of week 2, because Teamwork Graph's update delay is undocumented and needs slack.

**The story:** Northwind Pay, a fictional fintech team of 7. Meera (senior engineer) leaves in 10 days. She quietly owns the payment-retry service, so its runbook, two open PRs and an on-call page exist only in her head. That gives the demo its hero item: High risk, "Only Meera".

| Asset | Amount | Notes |
| --- | --- | --- |
| Users | 7 accounts | Free Jira and Confluence sites allow 10 users; use email aliases you control |
| Teams | 2 (Payments, Platform) | Meera in both |
| Jira issues | about 60 across 2 spaces | 14 assigned to Meera: in progress, stale, due after her last day |
| Bitbucket PRs | 6 in one repo | 2 by Meera that she alone reviews, 1 she reviews for someone else |
| Confluence pages | about 12 | 4 owned only by Meera, 1 linked from 3+ pages |
| Goals and projects | 2 goals, 1 project | Meera contributes to 1 |

**Scripts (`scripts/seed/`)**

- `seed-jira.ts`, `seed-confluence.ts`, `seed-bitbucket.ts`: idempotent Node scripts using REST API tokens. Each person's actions need that person's own token so authorship is real.
- `reset.ts` wipes everything Baton created (handovers, reassignments) so the demo can be re-run.
- Fixture dumps of real graph responses go to `test/fixtures/` for unit tests.

**Sites**

- **Dev site:** day-to-day development with `forge tunnel`.
- **Judge-sim site:** a second, clean site with the seed loaded but Baton never installed. Every week from week 3, install from the sharing link and run the full flow. This is the most important test, because judges install fresh.
- Teamwork Graph needs Bitbucket linked to the same organization. Confirm Bitbucket PRs appear in `atlassianUserPullRequests` during week 1.

## Testing and verification

Three layers: unit tests for the scoring logic, contract tests for the LLM and graph boundaries, and a scripted end-to-end run in Claude in Chrome on the judge-sim site before every milestone.

| Layer | Tool | What it covers | Target |
| --- | --- | --- | --- |
| Unit | Vitest | `scoreRisk`, `rankOwners`, graph response normalizers, access rules | Every signal in the risk table has a test; 90%+ line coverage on `src/scoring/` |
| Contract | Vitest + fixtures | Graph parsers against recorded responses; LLM output validator (unknown ARIs stripped, retry path, schema failures) | Every query has one recorded fixture |
| Integration | `forge tunnel` on the dev site | Resolvers end to end with real graph data and real LLM calls | Manual, each PR |
| End to end | Claude in Chrome | The full demo flow on the judge-sim site (below) | Green before Dec 7, Dec 14 and the submission |
| Agent and MCP | Rovo chat + Claude Desktop | The 4 conversation starters return correct, cited answers; the MCP tool `find-owner` works from an external client | Green before Dec 14 |

**End-to-end script (Claude in Chrome)**

- [ ] Install Baton from the sharing link on the judge-sim site, grant scopes as org admin
- [ ] Create a handover for Meera; inventory shows 14+ Jira items, 3 PRs and 4 pages; the payment-retry runbook is High risk with the "Only Meera" chip
- [ ] Owner suggestions are non-empty for every High item
- [ ] Generate questions; at least 5 appear and each links to real items
- [ ] Switch to Meera's account; she sees only her questions; answer and click Done
- [ ] Generate and publish; the Confluence page exists, links work and mentions resolve
- [ ] Reassign 3 issues; Jira shows the new assignees
- [ ] Ask the Rovo agent "Who owns PAY-142 now?" and get the right answer with a link
- [ ] Switch to a non-recipient account; Baton shows no handover
- [ ] Run `reset.ts`; the site is back to the seed state

**Test-first rule:** risk scoring, owner ranking and the LLM output validator get tests written before the implementation (per the TDD workflow).

## Timeline and work split

About 100 person-hours in total. Aditi owns graph, scoring, LLM and agent work; Keshav owns UI, seed data and publishing. Everything is frozen on Dec 14, so the last week is only for polish, testing and the video.

&#91;embedded content: build plan · Nov 17 to Dec 21, 2026\]

The week-1 spikes gate the whole plan: if they fail, switch to a fallback idea on Nov 24 rather than pushing on.

**Gates**

- **Nov 23, go or no-go:** the Query Builder returns Meera's issues, PRs and pages; a Forge LLMs call works; hello-world Rovo agent and `rovo:mcp` deploy; Confluence publish works from the app.
- **Dec 7, MVP demo-able:** Flows 1 and 2 work end to end on the dev site; the Claude in Chrome run passes up to Generate questions.
- **Dec 14, feature freeze:** the full end-to-end script passes on the judge-sim site; the agent and MCP checks pass.
- **Dec 19, video locked:** script, recording, edit. **Dec 21:** submit.

## Risks, open questions and submission checklist

The biggest risk is the data, not the code. If Teamwork Graph doesn't return Bitbucket PRs or page ownership on our test site, Baton loses its cross-product story. Week 1 spikes decide whether we go ahead.

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Graph is missing Bitbucket PRs or page ownership | Medium | High | Week 1 spike in the Query Builder; fall back to Jira REST and Confluence REST for missing types |
| Graph updates lag behind seeded data | Medium | High | Seed by Nov 30; never seed the day before recording |
| Judges' site lacks Rovo or org admin rights | Medium | Medium | Install guide states the requirements; the video shows every feature working |
| Cross-product Confluence publish fails from a Jira app | Medium | Low | Spike in week 1; fall back to an in-app page plus "Copy as Confluence markup" |
| A missing scope silently drops data | High | Medium | A startup self-check per item type; the empty state links to admin settings |
| Preview APIs change before Dec 22 | Low | Medium | Watch the Forge and Teamwork Graph changelogs weekly |
| Keshav busy with ContextCon | Medium | High | Confirm hours this week; each workstream can be cut down to MVP alone |
| PlayPower IP or side-project clause | Low | High | Aditi checks her contract this week; no PlayPower code, data or sites |

**Open questions (decide by Nov 23)**

- [ ] Category: Business Teams (less crowded, people-problem framing) or Software Teams (fits PRs). Recommendation: Business Teams.
- [ ] Do we go for the Marketplace bonus (a free listing, review time unknown)? Decide by Dec 7.
- [ ] Is Rovo enabled on free developer sites? Ask in the Nov 17 build session.
- [ ] Can one app list both Jira and Confluence modules, or is multi-app compatibility needed?
- [ ] Is `rovo:skill` available now?

**Submission checklist (target: submit Dec 21, one day early)**

- [ ] Installation link from "Start sharing your app", tested on the judge-sim site
- [ ] Setup guide: org admin needed, scopes to grant, Rovo needed, how to enable external MCP
- [ ] Public YouTube video under 5 minutes, no copyrighted music, showing each bonus feature
- [ ] Devpost text: features, how it meets the Forge requirement, the category, and bonus write-ups (agent, MCP, Teamwork Graph)
- [ ] Repo link, plus a README with an architecture image
- [ ] Screenshots: inventory, knowledge capture, published page, Rovo chat, Claude Desktop MCP

## Sources

- [Codegeist 2026 on Devpost](https://codegeist2026.devpost.com/) and [rules](https://codegeist2026.devpost.com/rules)
- [Codegeist 2025 winners](https://www.atlassian.com/blog/developer/meet-the-winners-of-codegeist-2025-atlassian-williams-racing-edition)
- [Teamwork Graph API overview](https://developer.atlassian.com/platform/teamwork-graph/api-reference/overview/)
- [Curated queries](https://developer.atlassian.com/platform/teamwork-graph/curated-queries/)
- [Persisted Cypher queries](https://developer.atlassian.com/platform/teamwork-graph/persisted-cypher-queries/)
- [Call the Teamwork Graph API](https://developer.atlassian.com/platform/teamwork-graph/call-the-teamwork-graph-api/)
- [Teamwork Graph limitations and considerations](https://developer.atlassian.com/platform/teamwork-graph/limitations-and-considerations/)
- [rovo:mcp module reference](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/)
- [Forge LLMs API](https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-api/) and [pricing](https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-api-pricing/)
- Example apps: [Teamwork Graph Dashboards Widget](https://bitbucket.org/atlassian/forge-teamwork-graph-examples/src/main/forge-twg-dashboards/), [Teamwork Graph Rovo agent](https://bitbucket.org/atlassian/forge-teamwork-graph-examples/src/main/forge-rovo-agent/)
