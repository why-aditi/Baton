# Baton dev setup for Keshav

Nov 16, 2026 · from Aditi · updated Nov 22: the real app in `app/` is deployed and tested end to end

The backend works end to end on the demo site: the app page, the Rovo agent and Claude Desktop (MCP) all see the same handovers, and publish and reassign work. This gets you your own copy, on your own environment and demo site. Plan on about an hour.

| Piece | Status on Nov 22 |
| --- | --- |
| Teamwork Graph reads | Work. New activity is indexed within ~5 min. Real responses are saved in `app/test/fixtures/`. Team lookups work from the backend; from the browser bridge they 403, so all graph reads go through the `graphQuery` resolver ([forum thread](https://community.developer.atlassian.com/t/teamwork-graph-atlassianuserinteams-returns-edges-but-every-node-fails-with-teamsv2-status-code-is-403/103977)) |
| Groq from a Forge resolver | Works |
| Rovo agent "Baton" | Works: start and list handovers in Ask Rovo |
| Claude Desktop (MCP) | Works, and sees the same handovers as Rovo |
| Publish to Confluence | Works, as the signed-in user, with @mentions and item links |
| Reassign Jira issues | Works, as the signed-in user |
| Bitbucket PRs in the graph | Work through the person's Jira issues, not the person (Nov 23): the graph files Bitbucket people under third-party IDs. A PR needs a Jira key to be found (section 8) |
| Custom UI | Not built. Yours (section 7) |

The repo has two apps. `app/` is the real Baton and is what you set up. `spike/` is the week-1 test page, now only useful for recording graph fixtures (section 7). Aditi's site is `one-atlas-ubvd.atlassian.net`; you'll get your own.

## 1. Before you start

**Aditi does these first:**

- [x] Push the repo to GitHub (`why-aditi/Baton`).
- [x] Add you as a collaborator on it.
- [x] Add you to the Developer Space that owns the app (developer.atlassian.com/console). Without this, `forge deploy` fails for you.
- [x] Send you the Groq API key through a password manager, not chat.
- [ ] Send you the Mistral API key the same way, once there is one.

**You need:**

- Node.js 22. Run `node -v` to check.
- An Atlassian account and an API token from id.atlassian.com/manage-profile/security/api-tokens.
- Chrome and Claude Desktop, for testing Rovo and MCP.

## 2. Install, deploy, install on your site

1. Install the Forge CLI, **pinned to 14.2.0**:
    ```
    npm install -g @forge/cli@14.2.0
    ```
    CLI 15.x needs Node 22.23.4 or later. If your Node is newer you can use 15.x, but 14.2.0 is what the code is tested with.
2. Log in: `forge login` (your email + API token).
3. Get a Codegeist demo site: `forge site provision`. It takes several minutes; rerun the same command to check progress. Your site comes with Jira, Confluence, Rovo, Studio and sample data, and lasts 90 days, so it should still be alive for judging (Jan 5 – Feb 3).
4. Clone the repo, then:
    ```
    cd app
    npm install
    npm test
    ```
5. Create your own Forge environment, so your deploys don't overwrite Aditi's:
    ```
    forge environments create
    ```
    Name it `keshav` when asked. Check `forge environments --help` if the flags differ.
6. Set the LLM keys in your environment:
    ```
    forge variables set --encrypt -e keshav GROQ_API_KEY <key>
    forge variables set --encrypt -e keshav MISTRAL_API_KEY <key>   # optional fallback, once it exists
    ```
7. Deploy, install in Jira, then connect Confluence. The manifest declares Jira as the required product and Confluence as optional, so both commands add to **one** installation (see section 6 for why that matters).
    ```
    forge deploy -e keshav
    forge install -e keshav -p Jira -s <your-site>.atlassian.net --confirm-scopes
    forge install -e keshav -p Confluence -s <your-site>.atlassian.net --confirm-scopes
    forge install list
    ```
    `forge install list` should show one row: `Jira (required)` plus `Confluence`. If a deploy stops with "approval requested", rerun it with `--approve MAJOR_VERSION_RULE`; adding hosts or scopes counts as a major version.
8. Open Jira → Apps → **Baton**. Until your UI exists it shows a dev page that calls any resolver by name with a JSON payload.

Use `forge logs -e keshav -f` in a second terminal while testing.

## 3. Connect Rovo, MCP, Bitbucket

**Rovo agent.** Nothing to set up. On your demo site, click **Ask Rovo** (top right), open the agent picker, search "Baton" and ask "List open handovers". Baton shows up once; if you see it twice, the app is installed per product (section 6). People in its answers are profile chips linking to `<site>/jira/people/<accountId>`. The first time an account opens a Jira profile, Jira may show a one-time "What kind of work do you do?" screen first.

**MCP for Claude Desktop.**

1. admin.atlassian.com → your org → Apps → Sites → your site → **Connected apps**.
2. Search "Baton" and open **View app details**. It should say "Connected to Jira (Required), Confluence". If you see two separate Baton entries, the app was installed per product: see section 6.
3. Under **Tools → Expose tools to MCP-compatible apps**, click **Enable tools**, then **Enable**.
4. Claude Desktop → Settings → Connectors → **Add custom connector**. Name `Baton`, URL `https://mcp.atlassian.com/forge/83b0292d-c06a-4bec-9e04-426a67cb0280`. Sign in and pick **your** site.
5. You should see the five Baton tools. Ask "List open handovers". After any install change, **Disconnect** the connector and connect again.

**Bitbucket.** PRs are a big part of the demo, and whether they reach the graph is still pending. Demo orgs already include a Bitbucket Premium workspace (on Aditi's, `bitbucket.org/one-atlas-ubvd`). Two setup steps, both done on Aditi's site on Nov 22:

1. **Unblock it.** If every Bitbucket page shows "You're currently blocked from this page", the workspace has its own IP allowlist. It isn't in admin.atlassian.com's IP allowlists. On the block page, click **request disabling IP allowlisting**, follow the emailed link, then in Bitbucket → Workspace settings → **Access controls** make sure "Restrict access to certain IP addresses" is unticked.
2. **Link it to Jira.** Bitbucket → Workspace settings → Atlassian integrations → **Jira** → **Connect** next to your site, then **Grant access** on both prompts (Jira to Bitbucket, then Bitbucket to Jira). Jira → Settings → DVCS accounts should then list the workspace and its repos.

Then create a PR as a seeded user **with a Jira key in its title**. Baton finds PRs through the issues they mention, not through the person: the graph files Bitbucket people under third-party IDs, so `atlassianUserPullRequests` returns nothing for Bitbucket (section 8). The issue's Development panel shows the PR once Jira has it; on Aditi's site that took up to an hour after linking.

**The IP allowlist can come back.** It was off on Nov 22, blocking again the next morning, and off again by 09:35 that day (Nov 23). Check that Bitbucket opens right before running the seed. If it shows the block page, untick "Restrict access to certain IP addresses" under Workspace settings → Access controls and click **Update**. The red "you must add your current IP address" note under the box is only a warning about turning it back on.

## 4. Seed data (your workstream)

**The demo site's pre-loaded data doesn't show up in Teamwork Graph.** Alana Grant has 36 open issues in Jira, and the graph returns 0 for her. A new issue created via the API showed up within 5 minutes. So all Northwind Pay data must be created fresh, through the API or UI, by the real users.

The scripts are written (Nov 22) and live in `scripts/`; `scripts/README.md` has the full steps. They haven't been run against a site yet. What's left:

- [x] **Write the seed scripts** (Nov 22, on `main`). `npm test` in `scripts/` passes against in-memory fakes of Jira, Confluence and Bitbucket.
- [x] **Jira projects and Confluence space** (Nov 23, on Aditi's demo site): `PAY` (Payments) and `NWPLAT` (Platform), both company-managed with a Task issue type that has Due date on its create screen, and the `NWP` space. The site already has a `PLAT` ("Platform Development"), so the seed maps the story's PLAT to `NWPLAT`: set `SEED_PLAT_KEY=NWPLAT` in `scripts/.env.seed`.
- [x] **`scripts/.env.seed` on Aditi's machine** (Nov 23, git-ignored): every setting except the 7 emails and tokens, including site `one-atlas-ubvd.atlassian.net`, space `NWP`, workspace `one-atlas-ubvd`, Bitbucket project `DEMO` (the workspace's only project; Premium workspaces need one for new repos) and `SEED_PLAT_KEY=NWPLAT`. On your own site, start from `.env.seed.example` and use your site's values.
- [ ] **Invite the 7 users** (Meera, Arjun, Lin, Priya, Sam, Dana, Omar) with email aliases you control and Jira, Confluence and Bitbucket access. Sign in as each and create an API token. Only a person can do this.
- [ ] **Then, with the users in place:** create the 2 teams (Payments, Platform), add the users to the Bitbucket workspace, and create the goals and project in Atlassian Home (no API). Claude can do these in Chrome once the users exist.
- [x] **Bitbucket's IP allowlist is off** (Nov 23, 09:35): Bitbucket opens again. Recheck right before seeding (section 3).
- [ ] **Add the 7 emails and tokens to `scripts/.env.seed`** yourself, then Claude runs `npm run seed`. A dry run with the file as it is stops before touching the site and lists exactly the 14 missing values.
- [ ] **Run `npm run seed` in `scripts/`.** It creates 59 Jira issues (14 open ones for Meera), 12 Confluence pages (the payment-retry runbook and 3 more only Meera has touched) and 6 Bitbucket PRs (2 by Meera with no other reviewer). It's safe to rerun.
- [ ] **Seed by Nov 30.** Don't reseed the day before recording; indexing can lag. Seeded issues can't be backdated, so none will show the "Stale" chip until 30 days after seeding.
- [ ] **Update the agent's suggested question** "Who owns PAY-142 now?" in `app/manifest.yml` to the hero issue's real key (`PAY-1` on fresh projects).
- [ ] **Re-record the graph fixtures** against seeded users (section 7).
- Teams: solved (Nov 23). From the app page, `@forge/bridge`'s `requestTeamworkGraph` gets a 403 on every team (the recorded `userTeams.app-403.json`). From the backend, `api.asUser().requestTeamworkGraph` returns them, which a forum reply suggested and the demo site confirmed. So the UI sends graph reads through the `graphQuery` resolver (section 7), and teams show up.
- Between demo runs: `npm run reset`, then the `deleteAllHandovers` resolver (`scripts/README.md` section 3).

## 5. Check it works

All on your site, from Jira → Apps → **Baton** (the dev page) unless it says otherwise:

- [ ] The Baton page loads
- [ ] `listHandovers` with payload `{}` returns `{ "ok": true, "data": [] }`
- [ ] `createHandover` with `{"subjectAccountId":"<someone's account ID>","subjectName":"<their name>","reason":"leaving","lastDay":"2026-12-20"}` returns the new handover
- [ ] `updateSummary`, then `publishHandover` with `{"id":"<id>","spaceKey":"<a space key>"}`, returns the handover with a `confluencePageUrl`, and the page opens
- [ ] Ask Rovo → Baton → "List open handovers" shows it
- [ ] Claude Desktop → "List open handovers" shows the same handover
- [ ] `forge logs -e keshav` shows `action caller via myself` for both

To find an account ID: open the person's Jira profile; the ID is the last part of the URL.

## 6. Gotchas we already hit

**Installs and platform**

- **The app must be one installation across Jira and Confluence** (the `compatibility` block in `app/manifest.yml`). Installed separately per product, each install has its own storage, and Forge runs Claude Desktop (MCP) calls through the Confluence one, so MCP saw no handovers. A Jira-only install doesn't work either: Confluence calls fail with `403 The app is not installed on this instance`. If you ever see two Baton entries under Connected apps, uninstall the Confluence one (`forge install list`, then `forge uninstall -i <id>`) and run the Confluence install again.
- **MCP calls carry no `accountId` in the payload**, unlike Rovo agent calls. The actions ask Jira's `/myself` instead, which works from both.
- **Never log a whole action payload.** It contains a signed `contextToken`.
- **Publish to Confluence as the user** (`asUser()`). As the app it can't see any spaces.
- **`@forge/resolver` import:** Forge CLI 14.2 wraps the default export one level too deep. Keep the unwrap at the top of `src/index.ts`.
- **No `noEmit` in `tsconfig.json`.** Forge's bundler then emits nothing and the deploy fails. `npm run typecheck` passes `--noEmit` itself.
- **Forge storage entities reject empty-string attributes.** The store drops them on write; keep that in mind if you add fields.
- **No `"type": "module"` in `package.json`.** It breaks the bundle.
- **Groq models:** the account has no Llama models. Use `openai/gpt-oss-20b` (fast) or `openai/gpt-oss-120b` / `qwen/qwen3.8-27b` (large).

**Teamwork Graph** (more in `app/test/fixtures/README.md`)

- **Graph queries need an operation name** of the form `company_operation`, e.g. `query baton_assignedWork(...)`, or they're rejected.
- **Don't select `edges.cursor`.** It comes back null and wipes out the whole edge. Paginate with `pageInfo.endCursor`; `first` is capped at 25.
- **Graph edges can be `null`** (rows the caller can't read). Skip them, don't crash.
- **`atlassianUserPullRequests` requires `since`** (e.g. `"P90D"`).
- **`roles` is unreliable on graph queries.** `atlassianUserGoalsAndProjects` breaks with any value, and `atlassianUserPullRequests` breaks too (Nov 22). Leave `roles` out and filter afterwards.
- **`JiraWorkItem` has no `title` field**; it's `summary`.
- **The saved pages query returns each page twice** (owns + created). Deduplicate by ARI.
- **Saved graph query keys are tied to the app ID**, so `src/graph/queryKeys.ts` works on your site too. Changing a query means registering a new one and getting a new key.

**Submission**

- **Multi-product apps can't have a free Marketplace listing.** It must be paid. That doesn't rule out the Marketplace bonus: the rules accept apps "published to the Marketplace or submitted for listing" (a listing link or the review ticket), but a paid listing needs partner and payment setup.
- **Judges install from a link.** With one installation across two products, the install guide must say "install in Jira, then connect Confluence". Test this on a clean site.

## 7. The real app (`app/`)

`app/` holds the backend: scoring, the LLM calls, storage, the app page's resolvers, the five Rovo/MCP actions, and publish and reassign. The UI isn't built yet. `app/README.md` has the details, including the full resolver table.

**Run the tests** (no site or login needed): `npm test` and `npm run typecheck` in `app/`.

**The spike.** `app/manifest.yml` uses the spike's app ID, because saved graph query keys belong to the app ID, so deploying either one to an environment replaces the other. You only need the spike to re-record graph fixtures (its **Inspect types** and **Run raw query**); `app/test/fixtures/README.md` also describes a faster route from the browser. Redeploy `app/` afterwards.

**What's yours in `app/`:**

- **The Custom UI.** `app/static/ui/` holds a placeholder and a dev page (`dev.js`) for calling resolvers. Build the UI (React + `@atlaskit`), point `resources` in the manifest at its build output, and delete both files.
- **Calling the backend.** Use `invoke(name, payload)` from `@forge/bridge`. Every resolver returns `{ ok: true, data }` or `{ ok: false, error: { code, message } }`. A `not_found` code also means "no access", so show the same empty state either way.
- **Routing.** Links from the Rovo agent go to `<site>/jira/apps/<appId>/<envId>/handover/<id>`. The UI should route on `/handover/<id>`.
- **Who sees what.** `getHandover` returns `{ role: 'editor', handover }` for the manager, recipients and Jira admins. For the departing person it returns a questions-only view (`role: 'subject'`). Render the knowledge-capture screen for `subject` and the inventory for `editor`.
- **Reading the graph.** The UI drives it, but every query runs on the backend as the user, because team lookups 403 through the browser bridge. Call `buildInventory({ request: backendGraphRequest(invoke), subjectAri, subjectName, ownedPagesQueryKey: PQ_USER_OWNED_PAGES, pageLinksQueryKey: PQ_PAGE_INBOUND_REFS, onProgress })` from `app/src/graph/inventory.ts`. `backendGraphRequest` is in `app/src/graph/proxy.ts`, `invoke` comes from `@forge/bridge`, and both keys are in `app/src/graph/queryKeys.ts`. Don't use `requestTeamworkGraph` from the bridge. The `graphQuery` resolver behind it runs only Baton's own queries, by name. It returns `{ items, teams, openAssigned, people, warnings }`: send everything except `warnings` to `saveInventory` with the handover `id`, and show `warnings` as banners. `subjectName` (the handover's `subjectName`) is what finds Bitbucket PRs: without it they're missed (section 8). `onProgress` reports each source (`assignedJira`, `reportedJira`, `pullRequests`, `pages`, `goalsAndProjects`, `teams`, then `details`) for the progress bar. It makes a few dozen graph calls, so expect several seconds.
- **The LLM can fail.** `generateQuestions` and `generateSummary` return `llm_unavailable` when both LLM providers fail or the hourly limit (20 calls per site) is hit. Show the error and keep the rest of the screen working. The inventory never depends on the LLM.
- **Publish.** `publishHandover({ id, spaceKey })` needs a summary, creates the Confluence page as the user, and moves the handover to Published. It returns the handover with `confluencePageUrl`. A missing space or a duplicate title come back as `bad_input` / `conflict` with a message you can show.
- **Reassign.** `reassignIssues({ id, itemAris })` assigns each Jira issue to its accepted owner, as the user, and returns `{ results: [{ ari, key, accountId, ok, error? }] }`. One failure doesn't stop the rest. Show the confirmation dialog listing every change **before** calling it, then show any failed rows.

**Gotchas for the UI:**

- **Don't build `Item`s by hand.** `buildInventory` sets every field scoring reads (status category, reviewers, due dates, container), and `saveInventory` adds Jira's updated date and sprint end. If you add a source of your own, follow `app/src/graph/normalize.ts`: a missing field doesn't error, the item just scores lower.
- **Item URLs must be `http` or `https`.** `saveInventory` rejects anything else, so a bad link can't reach the published page.
- **People are stored by account ID**, but collaborators and team members are user ARIs (`ari:cloud:identity::user/<accountId>`). Pass display names to `saveInventory` as `people: { accountId: name }`.
- **LLM results are cached.** Calling a generate resolver again returns the stored result unless the inputs changed. Pass `regenerate: true` for a "Regenerate" button.

## 8. Aditi's remaining work

So you know what's coming and what blocks you. Items marked **(affects you)** change what your UI or seed data can rely on.

**Done**

- [x] **Recorded what the graph returns** (Nov 22): `app/test/fixtures/`, findings in its README. Re-record once your seed lands.
- [x] **Deployed `app/` and tested Rovo and Claude Desktop** (Nov 22): both identify the caller and see the same handovers, now that the app is one installation.
- [x] **Publish and reassign backend** (Nov 22), tested live on the demo site. **(affects you)**
- [x] **`rovo:skill` exists** (Preview). Wrapping `get-handover` and `find-owner` as skills is still to do (below).
- [x] **Turn graph results into items.** `app/src/graph/normalize.ts`, one converter per query, tested against the fixtures. The queries are checked against the recorded schema in a test.
- [x] **One function that builds the inventory.** `buildInventory` in `app/src/graph/inventory.ts`; see "Reading the graph" in section 7. **(affects you)**
- [x] **Workload counts for owner ranking.** `buildInventory` counts open assigned work for up to 25 likely owners.
- [x] ~~Register `PQ_ITEM_COLLABORATORS`.~~ Not needed for now: `buildInventory` gets collaborators from page contributors and issue commenters instead. Revisit if that's too slow on real data.

**Bitbucket**

- [x] **Turn off the Bitbucket workspace's IP allowlist** (Nov 22), so Bitbucket is reachable.
- [x] **Link the Bitbucket workspace to the Jira site** (Nov 22).
- [x] **Test PRs:** repo `baton-pr-probe` with PR #1 (before linking) and PR #2, "SALES-31 Baton graph probe 2" (after linking).
- [x] **Bitbucket PRs in the graph** (Nov 23). The graph has them, but files authors and reviewers under third-party IDs (`ari:cloud:identity::third-party-user/…`), so "this person's PRs" (`atlassianUserPullRequests`) returns nothing. Asking each Jira issue for its linked PRs (`jiraWorkItemLinkedExternalPullRequests`) works. `buildInventory` does that for the person's issues, matches authors and reviewers to accounts by display name, and keeps only PRs the person wrote or reviews. **(affects you)**
  - **A PR is found only if a Jira key is in its title, branch or commits.** The seed puts one in every title.
  - **A PR Meera only reviews** is found only if it's linked to one of her own issues. The seed's "Meera reviews Arjun's PR" needs to carry one of her issue keys.
  - **Reviewers are untested on a real PR:** both test PRs have none, and Bitbucket is blocked by its IP allowlist again (Nov 23). If a reviewer's name doesn't match an account, the PR gets no reviewers, so "No other reviewer" can't fire wrongly.
  - **Ruled out:** Bitbucket's API from the app (Forge refuses Bitbucket scopes alongside Jira and Confluence ones: "Workspace scopes can not be used with site scopes") and Jira's `/rest/dev-status` API ("Authentication Required" from Forge; it only takes a browser session).

**Code**

- [x] **Jira fallback.** `saveInventory` asks Jira's search API, as the user, for each issue's updated date and sprint end, so the "stale" and "sprint ends" signals now fire for Jira issues. If the lookup fails, it scores from the graph alone. Verified on the demo site (Nov 22): SALES-24, untouched since March 2025, got its date from Jira and the "Stale" reason.
- [x] **Page link counts** for the "widely referenced" signal (Nov 22). The graph's `content_entity_links_entity` relationship gives a page's incoming links: tested with three pages linking to one, two with native page links and one with a plain URL, and all three showed up within about 4 minutes. `buildInventory` runs the saved query `PQ_PAGE_INBOUND_REFS` per page and sets `inboundLinks`. (`entity_links_entity` returned nothing.)
- [x] **Pull request query without `roles`** (Nov 22). `roles` started failing even as `[CREATED, REVIEWED]`, so the query leaves it off and the converter keeps only PRs the person wrote or reviews.

**LLM**

- [ ] **Mistral setup.** Create the account and key, turn on the training opt-out if there is one, send you the key, and pin exact model IDs instead of the "latest" aliases.
- [ ] **Try the three LLM calls on real seed data.** That's questions, one-liners and the summary: check that Groq's JSON mode works and the questions are concrete. **(needs your seed)**

**Scoring**

- [ ] **Tune the risk weights on seed data.** **(needs your seed, due Nov 30)**

**Agent and MCP**

- [ ] **Wrap `get-handover` and `find-owner` as `rovo:skill`s,** which helps with the Best Agents prize.
- [ ] **Check the agent's four suggested questions** give correct, cited answers in Rovo and in Claude Desktop, before Dec 14.
- [x] **Fix the agent's people links.** The actions now return `personUrl`, `currentOwnerUrl` and `newOwnerUrl` (`<site>/jira/people/<accountId>`), and the agent prompt says to link people only with those. Verified in Rovo (Nov 22): people show as profile chips that open their Jira profile.
- [x] **Baton showing up twice in the Rovo picker.** That came from per-product installs; with one installation it shows once (Nov 22).

**Loose ends**

- [ ] **Add the goal and project graph scopes** to the manifest, with exact names from the Scopes page.
- [ ] **Check the storage size limit** against a full handover.
- [ ] **Remove the dev-only page before submission:** `app/static/ui/dev.js`. (The `devGraphQuery` resolver is gone: `graphQuery` replaced it and only runs Baton's own queries.)
- [x] **Category: Apps for Software Teams** (decided Nov 22). The spec recommended Business Teams, but the demo story (Northwind Pay engineers, PRs, Jira) is a software team's. Frame the video and Devpost text for dev teams: unreviewed PRs, the knowledge only one engineer has. **(affects you)**
- [ ] **Marketplace bonus: decide on Dec 7**, once the MVP is demo-able. If there's slack then, submit a paid listing for review (a review ticket is enough for the prize; see section 6).
- [ ] **Check her employment contract** for side-project clauses.

**Dates:** go/no-go Nov 23. MVP demo-able on her dev site by Dec 7: start a handover, build the inventory, capture answers. Feature freeze Dec 14.

## Open questions

- Do Bitbucket PRs show up in `atlassianUserPullRequests` once Bitbucket's sync catches up? Recheck pending (section 3).
- Why does the browser bridge get a 403 on teams when the backend doesn't? Worked around with `graphQuery`; worth a reply on the forum thread.
