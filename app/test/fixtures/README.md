# Recorded Teamwork Graph responses

The normalizers in `src/graph/` are tested against these. Each file is
`{ recordedAt, site, query, variables, response }`; tests read `response`. `schema.json` lists every
field, union member, enum and argument reachable from the queries Baton uses (183 types).

Recorded on the Codegeist demo site. Most were re-recorded on **2026-11-23** against the seeded
Northwind Pay data (`scripts/`), with seeded Meera's real account ID swapped for the fake
**Meera Iyer** (`712020:00000000-0000-4000-8000-00000000me01`) the tests use. Other people are the
seeded personas (Arjun, Lin, Priya, Sam, Dana, Omar). `ownedPages`, `pageInboundRefs` and
`userTeams.app-403` are still the 2026-11-22 recordings: the first two only run as the app.

| File | Query | What it shows |
| --- | --- | --- |
| `assignedJira.json`, `reportedJira.json` | `atlassianUser{Assigned,Reported}JiraWorkItems` | Meera's 14 open assigned issues and 8 reported (7 of them also assigned to her), with status, `statusCategory.key`, assignee, reporter |
| `pullRequests.json` | `atlassianUserPullRequests` | Empty: Bitbucket people are third-party users, so this finds nothing for an Atlassian account |
| `userTeams.json` | `atlassianUserInTeams` | Platform and Payments, **called as the user** |
| `userTeams.app-403.json` | same, **called as the app** | Every node null with teamsV2 403 errors |
| `teamMembers.json` | `atlassianTeamMembers` | The Payments team's 5 `AtlassianUser` nodes |
| `goalsAndProjects.json` | `atlassianUserGoalsAndProjects` (no `roles`) | Meera's goal "Reduce failed payment retries by 30%" |
| `pageContributors.json` | `confluencePageContributors` | Meera, the only contributor to the payment-retry runbook |
| `workItemComments.json` | `jiraWorkItemComments` | Empty (no comments on PAY-1) |
| `ownedPages.json` | `customQuery` with `PQ_USER_OWNED_PAGES` | The same page twice, once per relationship |
| `issuePullRequests.json` | `jiraWorkItemLinkedExternalPullRequests` | PR #3 linked to PAY-7: Arjun's, Meera reviews. Author and reviewer are third-party IDs with `name: null` |
| `pageInboundRefs.json` | `customQuery` with `PQ_PAGE_INBOUND_REFS` | Three pages linking to one: two native page links, one plain URL |

## What the recording found

- **Don't select `edges.cursor`.** It comes back null and, being non-null, nulls the whole edge.
  Page with `pageInfo.endCursor` only.
- **`atlassianUserPullRequests` requires `since`** (e.g. `"P90D"`). Its `roles` argument is unreliable:
  `[CREATED]` alone fails with "In evaluation not implemented yet", and `[CREATED, REVIEWED]` worked
  in the morning and failed by the afternoon (Nov 22). Leave it off and filter by author and reviewers.
- **`atlassianUserGoalsAndProjects(roles: …)` fails** with "In evaluation not implemented yet" for any
  role. Without `roles` it returns everything linked to the user, which may include goals they only
  viewed or favourited.
- **Teams return 403 only when the app asks.** The same query as the user resolves. Tracked in the
  [forum thread](https://community.developer.atlassian.com/t/teamwork-graph-atlassianuserinteams-returns-edges-but-every-node-fails-with-teamsv2-status-code-is-403/103977).
- **`AtlassianUser.email` exists.** Never select it.
- **Bitbucket people have no names** (Nov 23). PR authors and reviewers are
  `third-party-user/…/tp:<Bitbucket user ID>` with `name: null`, still null hours after seeding.
  Baton recognises the subject by the ID on most PRs linked to their own issues
  (`inferSubjectId` in `src/enrich/pullRequests.ts`).

## Recording more

The quickest route is the browser console on a tab of the site: POST to `/gateway/api/graphql/twg`
with header `X-Query-Context: ari:cloud:platform::site/<cloudId>`. `customQuery` only runs as the
owning app, so record it with the spike's **Run raw query** instead. Swap any real person for a
seeded or fake one before saving.
