# Baton app

The real Baton app (the week-1 throwaway is in `../spike`). It has the backend: scoring, the LLM
layer, storage, the app page's resolvers and the five Rovo/MCP actions. The Custom UI isn't built
yet; `static/ui/index.html` is a placeholder so the app deploys.

It uses the spike's app ID, because saved graph query keys belong to the app ID. **Deploying `app/`
replaces the spike** in that environment.

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
| `src/index.ts`, `src/forge/` | Forge wiring: KVS store, caller identity, links. Not unit-tested |
| `src/graph/queryKeys.ts` | Persisted Teamwork Graph query keys |

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
| `markPublished` | `{ id, pageId, url }` | editor | `Handover`, moved to published. Call it after publishing creates the page |

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
  no account ID. Untested on a site.
- **Storage** keeps a `handover-member` row per person who can see a handover, so listing by recipient
  works (KVS can't index an array). One handover is one entity, so check the entity size limit
  against the seed data before relying on the 500-item cap.
