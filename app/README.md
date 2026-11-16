# Baton app

The real Baton app (the week-1 throwaway is in `../spike`). So far this holds Aditi's pure core:
scoring and the LLM layer. No Forge modules yet; resolvers, the manifest and the UI come next.

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
| `src/graph/queryKeys.ts` | Persisted Teamwork Graph query keys |

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
