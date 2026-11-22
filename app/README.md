# Baton app

The real Baton app (the week-1 throwaway is in `../spike`). It has the backend: scoring, the LLM
layer, storage, the app page's resolvers and the five Rovo/MCP actions. The Custom UI isn't built
yet; `static/ui/index.html` is a placeholder so the app deploys.

It uses the spike's app ID, because saved graph query keys belong to the app ID. **Deploying `app/`
replaces the spike** in that environment.

**One installation across Jira and Confluence.** The manifest's `compatibility` block makes Jira the
required product and Confluence optional, so `forge install -p Jira` then `forge install -p Confluence`
add to one installation with one Forge storage. Separate per-product installs each get their own
storage, and Forge runs MCP calls through the Confluence one, so Claude Desktop saw no handovers.
Confluence must be connected: publishing fails with `403 The app is not installed on this instance`
without it.

```sh
forge variables set --encrypt GROQ_API_KEY <key>
forge variables set --encrypt MISTRAL_API_KEY <key>    # optional fallback
forge deploy && forge install --upgrade
```

```sh
npm install
npm test            # Vitest
npm run coverage    # fails under 90% lines on src/scoring
npm run typecheck
```

| Path | What |
| --- | --- |
| `src/types.ts` | `Item`, `ScoredItem` (spec shapes plus the fields the risk signals need) |
| `src/scoring/risk.ts` | `scoreRisk`: the 0–100 knowledge-risk table, with a reason per signal |
| `src/scoring/owners.ts` | `rankOwners`: top 3 owners, `3·item + 2·team + 1·project − 2·load` |
| `src/scoring/inventory.ts` | `scoreInventory`: dedupe by ARI, score, rank, sort by risk |
| `src/llm/client.ts` | `complete` (Groq, then Mistral) and `completeValidated` (one retry, `null` on failure) |
| `src/llm/validate.ts`, `schemas.ts` | Schema check and grounding: unknown ARIs stripped, >20% unknown rejected |
| `src/llm/pseudonymize.ts` | People to P1, P2… before a call, and back after |
| `src/llm/tasks.ts` | The three LLM calls: questions, one-liners, summary. Items go out as refs I1, I2…, people as P1, P2… |
| `src/handover/service.ts` | Every resolver's logic: access checks, state changes, LLM caching, the 20-calls-an-hour limit |
| `src/handover/access.ts` | Who sees what: editor (initiator, recipients, Jira admins), subject, or nobody |
| `src/actions/index.ts` | The five Rovo/MCP actions, with replies kept under 4 KB |
| `src/publish/page.ts` | `pageTitle`, `pageBody`: the published handover in Confluence storage format, with @mentions and item links |
| `src/index.ts`, `src/forge/` | Forge wiring: KVS store, caller identity, links, Confluence page create and Jira assign (`atlassian.ts`). Not unit-tested |
| `src/graph/inventory.ts` | `buildInventory`: runs every query as the user and returns what `saveInventory` takes, plus warnings |
| `src/graph/queries.ts` | The graph queries, checked against `test/fixtures/schema.json` by a test |
| `src/graph/normalize.ts` | Graph nodes to `Item`s, one converter per query, tested against the recordings |
| `src/graph/runner.ts` | `runPaged`: one graph query to the end (cursor paging, null rows, error codes, `QUERY_NOT_FOUND` retry) |
| `src/graph/merge.ts` | `mergeItems` (one item per ARI, strongest role wins) and `coverageWarnings` (the startup self-check) |
| `src/graph/queryKeys.ts` | Persisted Teamwork Graph query keys |
| `src/enrich/jira.ts` | Fills Jira issues' updated date and sprint end, which the graph lacks, from Jira's search API |

## Resolvers (for the UI)

Call with `invoke(name, payload)`. Each returns `{ ok: true, data }` or
`{ ok: false, error: { code, message } }`. The codes are `not_found` (also returned when you don't have
access), `bad_input`, `conflict`, `llm_unavailable` and `internal`.

| Resolver | Payload | Who | Data |
| --- | --- | --- | --- |
| `listHandovers` | `{ status? }` | anyone | rows: person, reason, last day, status, `role`, item, High, question and answered counts |
| `getHandover` | `{ id }` | editor or subject | `{ role: 'editor', handover }`, or the subject's questions-only view |
| `createHandover` | `{ subjectAccountId, subjectName, reason, lastDay, recipientAccountIds? }` | anyone except the subject | `Handover` (draft) |
| `saveInventory` | `{ id, items: Item[], teams?, openAssigned?, people? }` | editor | `Handover`, scored and sorted |
| `summarizeItems` | `{ id }` | editor | `Handover` with `oneLine` on High and Medium items |
| `generateQuestions` | `{ id, regenerate? }` | editor | `Handover`, moved to collecting |
| `saveQuestions` | `{ id, questions: { id?, text, itemAris }[] }` | editor | `Handover`. Leave `id` off for a new question |
| `answerQuestion` | `{ id, questionId, answer }` | subject | subject view |
| `finishAnswers` | `{ id }` | subject | subject view, moved to ready |
| `setOwner` | `{ id, itemAri, accountId \| null }` | editor | `Handover` |
| `generateSummary` | `{ id, regenerate? }` | editor | `Handover` with `summary` |
| `updateSummary` | `{ id, summary }` | editor | `Handover` |
| `markPublished` | `{ id, pageId, url }` | editor | `Handover`, moved to published. `publishHandover` already does this |
| `publishHandover` | `{ id, spaceKey }` | editor | Creates the Confluence page as the user (needs a summary), then `Handover`, moved to published, with `confluencePageUrl` |
| `reassignIssues` | `{ id, itemAris }` | editor | `{ results: { ari, key, accountId, ok, error? }[] }`. Jira issues with an accepted owner only. Show the confirmation dialog first |

`teams` is `{ name, members: userAri[] }[]`, `openAssigned` maps a user ARI to their count of open
assigned items, and `people` maps an account ID to a display name. LLM output is cached: calling
again returns the stored result until the inventory (or, for the summary, owners or answers) changes.
Links from the agent point to `<site>/jira/apps/<appId>/<envId>/handover/<id>`, so the UI should
route on that path.

## Choices the spec left open

- **Normalizer contract.** Normalizers set `statusCategory` (`todo` / `in_progress` / `done`; an open PR
  is `in_progress`), `reviewers` on PRs, `dueDate` / `sprintEndDate` on issues, `inboundLinks` on pages
  and `container` (project key, repo or space) on everything. Scoring reads only these.
- **Same-project term** counts other inventory items in the same container the candidate worked on,
  capped at 3 so one prolific person can't outrank someone who worked on the item itself.
- **Candidates scoring 0 or less** are not suggested.
- **Provider fallback** moves on for any failure, not just 429/5xx: Groq returns 400
  `json_validate_failed` when a model breaks JSON mode.
- **Questions** whose ARIs were all invented are dropped; fewer than 5 left counts as a failure.
- **The subject** sees only their own questions, in the app and through the agent. If a Jira admin is
  the one leaving, they get the subject's view of their own handover, not edit rights.
- **Actions** show only handovers the caller can edit. The subject and strangers get the same "No
  handover found" answer, so nobody learns that a handover exists.
- **Caller identity in actions** comes from Jira's `/myself` called as the user, because MCP calls carry
  no account ID. Tested on the demo site from Rovo and Claude Desktop (Nov 22).
- **Storage** keeps a `handover-member` row per person who can see a handover, so listing by recipient
  works (KVS can't index an array). One handover is one entity, so check the entity size limit
  against the seed data before relying on the 500-item cap.

## What the graph gives the inventory

`buildInventory` reads, for the departing person: assigned and reported Jira work items, PRs they
created or review (last 90 days), Confluence pages they own or created, goals and projects they own,
and their teams. It then adds page contributors and issue commenters as collaborators, loads members
for up to 10 teams, and counts open work for up to 25 likely owners.

Filtering, so the inventory is open work only: done or resolved issues, merged or declined PRs,
archived or deleted pages, and archived, done or cancelled projects are dropped. Goals and projects
the person doesn't own are dropped too, because the query can't filter by role.

**Gaps in the graph that scoring feels.** Jira issues have no updated date or sprint in the graph, so
`saveInventory` fills them in from Jira's search API, as the user (`src/enrich/jira.ts`, called through
`issueDetails` in `src/forge/atlassian.ts`). If that fails, scoring uses the graph data alone. Pages have
no link counts anywhere we can reach, so the "widely referenced" signal never fires yet.
