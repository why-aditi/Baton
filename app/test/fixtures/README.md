# Recorded Teamwork Graph responses

The normalizers in `src/graph/` are tested against these. Each file is
`{ recordedAt, site, query, variables, response }`; tests read `response`. `schema.json` lists every
field, union member, enum and argument reachable from the queries Baton uses (183 types).

Recorded 2026-11-22 on the Codegeist demo site. There was no Northwind Pay seed yet, so they were
recorded against Aditi's account with her identity swapped for a fake **Meera Iyer**
(`712020:00000000-0000-4000-8000-00000000me01`). Other names are Atlassian's fictional demo users.
Re-record after Keshav's seed lands.

| File | Query | What it shows |
| --- | --- | --- |
| `assignedJira.json`, `reportedJira.json` | `atlassianUser{Assigned,Reported}JiraWorkItems` | One `JiraWorkItem` with status, `statusCategory.key` (`new` / `indeterminate` / `done`), type, assignee, reporter |
| `pullRequests.json` | `atlassianUserPullRequests` | Empty: the demo org's Bitbucket is behind an IP allowlist |
| `userTeams.json` | `atlassianUserInTeams` | 20 `AtlassianTeam` nodes, **called as the user** |
| `userTeams.app-403.json` | same, **called as the app** | Every node null with teamsV2 403 errors |
| `teamMembers.json` | `atlassianTeamMembers` | `AtlassianUser` nodes |
| `goalsAndProjects.json` | `atlassianUserGoalsAndProjects` (no `roles`) | 17 `AtlassianGoal` + 8 `AtlassianProject` |
| `pageContributors.json` | `confluencePageContributors` | `AtlassianUser` nodes for one page |
| `workItemComments.json` | `jiraWorkItemComments` | Empty (no comments on the issue) |
| `ownedPages.json` | `customQuery` with `PQ_USER_OWNED_PAGES` | The same page twice, once per relationship |
| `issuePullRequests.json` | `jiraWorkItemLinkedExternalPullRequests` | The Bitbucket PR linked to SALES-31; its author is a third-party ID, not an Atlassian user |
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

## Recording more

The quickest route is the browser console on a tab of the site: POST to `/gateway/api/graphql/twg`
with header `X-Query-Context: ari:cloud:platform::site/<cloudId>`. `customQuery` only runs as the
owning app, so record it with the spike's **Run raw query** instead. Swap any real person for a
seeded or fake one before saving.
