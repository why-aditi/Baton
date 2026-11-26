# Baton dev setup for Keshav

Nov 16, 2026 · from Aditi · updated Nov 23 (evening): built, seeded, and run end to end on the demo site

The backend works end to end on the demo site: the app page, the Rovo agent and Claude Desktop (MCP) all see the same handovers, the inventory covers issues, PRs, pages, teams and goals, and publish and reassign work. This gets you your own copy, on your own environment and demo site. Plan on about an hour.

| Piece | Status on Nov 23 |
| --- | --- |
| Teamwork Graph reads | Work. New activity is indexed within ~5 min. Real responses are saved in `app/test/fixtures/`. All graph reads go through the backend `graphQuery` resolver, as the user |
| Teams | Load (Nov 23). Through the browser bridge every team 403'd; through the backend they come back ([forum thread](https://community.developer.atlassian.com/t/teamwork-graph-atlassianuserinteams-returns-edges-but-every-node-fails-with-teamsv2-status-code-is-403/103977)) |
| Risk signals | All six can fire: Jira's updated date and sprint come from Jira's REST API, page link counts from a saved graph query |
| Groq from a Forge resolver | Works |
| Rovo agent "Baton" | Works: start and list handovers in Ask Rovo |
| Claude Desktop (MCP) | Works, and sees the same handovers as Rovo |
| Publish to Confluence | Works, as the signed-in user, with @mentions and item links |
| Reassign Jira issues | Works, as the signed-in user |
| Bitbucket PRs in the graph | Work through the person's Jira issues (Nov 23). Bitbucket people have third-party IDs and no names, so Baton recognises the departing person by ID. A PR needs a Jira key to be found (section 8) |
| Custom UI | All five screens built in `app/ui/` and the whole flow run on the demo site with seed data (Nov 23): new handover, inventory, questions, Meera's answers, summary, publish, reassign (section 5) |
| Groq on seed data | Questions, one-liners and the summary all work (Nov 23) |
| Seed data | Seeded on Aditi's site (Nov 23): 59 issues, 12 pages, 6 PRs, both teams, 2 goals and the project. The project's owner is still Aditi (section 4) |

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
7. Build the UI, then deploy, install in Jira and connect Confluence. `forge deploy` uploads `app/ui/build`, so build it first, every time the UI changes:
    ```
    cd ui && npm install && npm run build && cd ..
    ```
    The manifest declares Jira as the required product and Confluence as optional, so both install commands add to **one** installation (see section 6 for why that matters). Then:
    ```
    forge deploy -e keshav
    forge install -e keshav -p Jira -s <your-site>.atlassian.net --confirm-scopes
    forge install -e keshav -p Confluence -s <your-site>.atlassian.net --confirm-scopes
    forge install list
    ```
    `forge install list` should show one row: `Jira (required)` plus `Confluence`. If a deploy stops with "approval requested", rerun it with `--approve MAJOR_VERSION_RULE`; adding hosts or scopes counts as a major version.
8. Open Jira → Apps → **Baton**. It opens on the handover list. The old resolver test page is now at the `/dev` route (`<site>/jira/apps/<appId>/<envId>/dev`): it calls any resolver by name with a JSON payload.

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

The scripts live in `scripts/`; `scripts/README.md` has the full steps. They ran on Aditi's site on Nov 23:

- [x] **Write the seed scripts** (Nov 22, on `main`). `npm test` in `scripts/` passes against in-memory fakes of Jira, Confluence and Bitbucket.
- [x] **Jira projects and Confluence space** (Nov 23, on Aditi's demo site): `PAY` (Payments) and `NWPLAT` (Platform), both company-managed with a Task issue type that has Due date on its create screen, and the `NWP` space. The site already has a `PLAT` ("Platform Development"), so the seed maps the story's PLAT to `NWPLAT`: set `SEED_PLAT_KEY=NWPLAT` in `scripts/.env.seed`.
- [x] **`scripts/.env.seed` on Aditi's machine** (Nov 23, git-ignored): every setting except the 7 emails and tokens, including site `one-atlas-ubvd.atlassian.net`, space `NWP`, workspace `one-atlas-ubvd`, Bitbucket project `DEMO` (the workspace's only project; Premium workspaces need one for new repos) and `SEED_PLAT_KEY=NWPLAT`. On your own site, start from `.env.seed.example` and use your site's values.
- [x] **Invite the 7 users** (Nov 23): Meera, Arjun, Lin, Priya, Sam, Dana and Omar, as `+name` aliases of one Gmail address, with Jira, Confluence and Bitbucket access through group membership. Each has an API token for the site and a second one for Bitbucket, both in `scripts/.env.seed`.
- [x] **Bitbucket repo access** (Nov 23). The users could see the workspace but no repos, so the seed got a 403. Fixed by creating `payments-service` in project `DEMO` and giving the group `bitbucket-users-one-atlas-ubvd` Write on it. The users' Bitbucket tokens lack `read:workspace` and `read:project`; the seed doesn't need them.
- [x] **Ran `npm run seed`** (Nov 23, ~11:05): 59 Jira issues (`PAY-1` to `PAY-34`, `NWPLAT-1` to `NWPLAT-25`), 12 Confluence pages in `NWP`, and 6 PRs in `one-atlas-ubvd/payments-service` (`#1` to `#6`). The graph shows Meera's 14 open issues. The Bitbucket IP allowlist had switched itself back on and had to be turned off again first (section 3).
- [x] **Teams** (Nov 23): Payments (Meera, Arjun, Lin, Priya, Omar) and Platform (Meera, Priya, Sam, Dana), created as Priya through the public Teams API (`/gateway/api/public/teams/v1/org/<orgId>/teams/` on the site, Basic auth with her token). Aditi isn't in either.
- [x] **Goals and project in Atlassian Home** (Nov 23, in the browser): goals "Reduce failed payment retries by 30%" (`GGTRTEJK-34`, owner Meera) and "Close the books in 2 days" (`GGTRTEJK-35`, owner Priya), and the project "Retry service v2" (`GGTRTEJK-36`).
- [ ] **Make Priya the project's owner.** It's still Aditi: the project's people picker didn't list any seed user yet, though the goal form found them. Retry in a day.
- [x] **PR people without names** (Nov 23). Six hours after seeding, PR authors and reviewers still came back with IDs and `name: null`. Baton now recognises the departing person by the ID on most PRs linked to their own issues, and counts the other, unnamed people as "someone else has context" without suggesting them as owners. On the site, Meera's 3 PRs show (2 hers, 1 she alone reviews).
- [ ] **Don't reseed close to recording day** (a reminder: it stays open until recording is done). Indexing can lag, and seeded issues can't be backdated, so nothing shows the "Stale" chip until 30 days after seeding: Dec 23 for the Nov 23 seed. If the demo needs a Stale item, record on or after Dec 23.
- [x] **Update the agent's suggested question** (Nov 23, PR #20) "Who owns PAY-142 now?" in `app/manifest.yml` to the hero issue's real key (`PAY-1` on fresh projects).
- [x] **Re-recorded the graph fixtures** on the seed (Nov 23), with seeded Meera swapped for the fake ID the tests use. `ownedPages` and `pageInboundRefs` are still from Nov 22: they only run as the app.
- Teams: solved (Nov 23). From the app page, `@forge/bridge`'s `requestTeamworkGraph` gets a 403 on every team (the recorded `userTeams.app-403.json`). From the backend, `api.asUser().requestTeamworkGraph` returns them, which a forum reply suggested and the demo site confirmed. So the UI sends graph reads through the `graphQuery` resolver (section 7), and teams show up.
- Between demo runs: `npm run reset`, then the `deleteAllHandovers` resolver (`scripts/README.md` section 3).

## 5. Check it works

**Already done on Aditi's site** (Nov 23, through the real UI on the seed, Priya running the handover for Meera):

- [x] Build (`npm run build` in `app/ui/`), `forge deploy`, and Baton opens from Jira → Apps
- [x] New handover for Meera, then build the inventory: 22 items, including her 3 PRs, the runbook and her goal
- [x] Draft questions with Baton: 8, each linked to its items
- [x] Meera, signed in as herself, sees "your handover", answers 2 questions (saved as she types), and "I'm done answering" warns about the 6 blank ones, then shows "Thanks, you're done"
- [x] Priya sees "Ready to publish" and 2 of 8 answered; the regenerated summary names items in its risks and folds in Meera's answer
- [x] Publish to `NWP`: page "Handover: Meera Iyer (last day 2026-12-30)", created as Priya, 9 @mentions, item links
- [x] Reassign: PAY-9 went from Meera to Lin in Jira (then put back on Meera so the seed stays as it was)
- [x] Ask Rovo → Baton (listed once) → "List open handovers" shows the same handover. Meera showed as a bare profile URL instead of her name; fixed Nov 24 (section 8), recheck after the next deploy
- [x] Claude Desktop → "List open handovers" (Nov 24, as Aditi) shows Meera's handover as published, plus Aditi's own test handovers (Jennifer Evans, Kevin Campbell, Alana Grant). It lists more than Rovo did because site admins see every handover; Priya isn't an admin

**On Keshav's own site** (done, reported Nov 26), all from Jira → Apps → **Baton** → `/dev` (the resolver test page) unless it says otherwise:

- [x] The Baton page loads
- [x] `listHandovers` with payload `{}` returns `{ "ok": true, "data": [] }`
- [x] `createHandover` with `{"subjectAccountId":"<someone's account ID>","subjectName":"<their name>","reason":"leaving","lastDay":"2026-12-20"}` returns the new handover
- [x] `updateSummary`, then `publishHandover` with `{"id":"<id>","spaceKey":"<a space key>"}`, returns the handover with a `confluencePageUrl`, and the page opens
- [x] Ask Rovo → Baton → "List open handovers" shows it
- [x] Claude Desktop → "List open handovers" shows the same handover
- [x] `forge logs -e keshav` shows `action caller via myself` for both

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

- **The Custom UI.** Started Nov 23 in `app/ui/` (React 18, Vite, `@atlaskit`), and the manifest's `resources` now points at `app/ui/build`. Built so far: the handover list, New handover (person search through Jira's user search as the user, reason, last day, an optional person to share with; creating it opens the handover and starts reading the graph), the handover page with Inventory and Questions tabs, and the departing person's answer screen. The Inventory tab is the split layout (risk-sorted list on the left; the selected item's score breakdown, owner choice and linked questions on the right), with the build-inventory progress panel, which reads the graph through `graphQuery`. The Questions tab drafts questions with Baton (or by hand), links each to items, saves them, and shows answers as they come in; when the LLM is down it says so and writing your own still works. The departing person sees only their questions, answers save a second after they stop typing (and when they leave the box), and "I'm done answering" moves the handover to Ready. The Review and publish tab has a checklist (confirmed owners, answers, summary, and a warning for high-risk items without an owner), the summary editor (generate with Baton, or write it yourself when the LLM is down), publishing to a Confluence space chosen from the user's spaces (unsaved summary edits are saved first, and a dialog confirms), and reassigning Jira issues with confirmed owners after a dialog that lists every change, with failed rows shown afterwards. Next: deploy to a site and run the flow end to end on seed data. `npm test` and `npm run build` in `app/ui/`. Designs picked on Nov 23: [UI directions](https://claude.ai/artifact/UazZ5o76sLqBHFL3smFZGy) (split detail) and [marketing pages](https://claude.ai/artifact/WYzrLVa7dcu8xntdvEUqHj) (developer dark).
- **Calling the backend.** Use `invoke(name, payload)` from `@forge/bridge`. Every resolver returns `{ ok: true, data }` or `{ ok: false, error: { code, message } }`. A `not_found` code also means "no access", so show the same empty state either way.
- **Routing.** Links from the Rovo agent go to `<site>/jira/apps/<appId>/<envId>/handover/<id>`. The UI should route on `/handover/<id>`.
- **Who sees what.** `getHandover` returns `{ role: 'editor', handover }` for the manager, recipients and Jira admins. For the departing person it returns a questions-only view (`role: 'subject'`). Render the knowledge-capture screen for `subject` and the inventory for `editor`.
- **Reading the graph.** The UI drives it, but every query runs on the backend as the user, because team lookups 403 through the browser bridge. Call `buildInventory({ request: backendGraphRequest(invoke), subjectAri, subjectName, ownedPagesQueryKey: PQ_USER_OWNED_PAGES, pageLinksQueryKey: PQ_PAGE_INBOUND_REFS, onProgress })` from `app/src/graph/inventory.ts`. `backendGraphRequest` is in `app/src/graph/proxy.ts`, `invoke` comes from `@forge/bridge`, and both keys are in `app/src/graph/queryKeys.ts`. Don't use `requestTeamworkGraph` from the bridge. The `graphQuery` resolver behind it runs only Baton's own queries, by name. It returns `{ items, teams, openAssigned, people, warnings }`: send everything except `warnings` to `saveInventory` with the handover `id`, and show `warnings` as banners. `subjectName` (the handover's `subjectName`) is what finds Bitbucket PRs: without it they're missed (section 8). `onProgress` reports each source (`assignedJira`, `reportedJira`, `pullRequests`, `pages`, `goalsAndProjects`, `teams`, then `details`) for the progress bar. It makes a few dozen graph calls, so expect several seconds.
- **The LLM can fail.** `generateQuestions` and `generateSummary` return `llm_unavailable` when both LLM providers fail or the hourly limit (20 calls per site) is hit. Show the error and keep the rest of the screen working. The inventory never depends on the LLM.
- **Publish.** `publishHandover({ id, spaceKey })` needs a summary, creates the Confluence page as the user, and moves the handover to Published. It returns the handover with `confluencePageUrl`. A missing space or a duplicate title come back as `bad_input` / `conflict` with a message you can show.
- **Reassign.** `reassignIssues({ id, itemAris })` assigns each Jira issue to its accepted owner, as the user, and returns `{ results: [{ ari, key, accountId, ok, error? }] }`. One failure doesn't stop the rest. Show the confirmation dialog listing every change **before** calling it, then show any failed rows.

**Gotchas for the UI:**

- **Run `npm run build` in `app/ui/` before every `forge deploy`.** The UI bundles `app/src/graph/` into itself, so a backend-only deploy ships the old inventory code. On Nov 23 a deploy without a rebuild found 0 PRs.
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
- [x] **`rovo:skill` exists** (Preview). `get-handover` and `find-owner` are wrapped as skills (below).
- [x] **Turn graph results into items.** `app/src/graph/normalize.ts`, one converter per query, tested against the fixtures. The queries are checked against the recorded schema in a test.
- [x] **One function that builds the inventory.** `buildInventory` in `app/src/graph/inventory.ts`; see "Reading the graph" in section 7. **(affects you)**
- [x] **Teams load** (Nov 23). Graph reads go through the backend `graphQuery` resolver: the browser bridge got a 403 on every team, the backend doesn't. Pass `request: backendGraphRequest(invoke)` to `buildInventory`. The dev-only `devGraphQuery` is gone. **(affects you)**
- [x] **Root README rewritten** (Nov 23) as the project's front page: pitch, flow, Mermaid architecture diagram, how Baton uses Teamwork Graph, install steps for judges, status. Covers the submission checklist's "README with an architecture image".
- [x] **Workload counts for owner ranking.** `buildInventory` counts open assigned work for up to 25 likely owners.
- [x] ~~Register `PQ_ITEM_COLLABORATORS`.~~ Not needed for now: `buildInventory` gets collaborators from page contributors and issue commenters instead. Revisit if that's too slow on real data.

**Bitbucket**

- [x] **Turn off the Bitbucket workspace's IP allowlist** (Nov 22), so Bitbucket is reachable.
- [x] **Link the Bitbucket workspace to the Jira site** (Nov 22).
- [x] **Test PRs:** repo `baton-pr-probe` with PR #1 (before linking) and PR #2, "SALES-31 Baton graph probe 2" (after linking).
- [x] **Bitbucket PRs in the graph** (Nov 23). The graph has them, but files authors and reviewers under third-party IDs (`ari:cloud:identity::third-party-user/…`), so "this person's PRs" (`atlassianUserPullRequests`) returns nothing. Asking each Jira issue for its linked PRs (`jiraWorkItemLinkedExternalPullRequests`) works. `buildInventory` does that for the person's issues, matches authors and reviewers to accounts by display name, and keeps only PRs the person wrote or reviews. **(affects you)**
  - **A PR is found only if a Jira key is in its title, branch or commits.** The seed puts one in every title.
  - **A PR Meera only reviews** is found only if it's linked to one of her own issues. The seed's "Meera reviews Arjun's PR" needs to carry one of her issue keys.
  - **Names never arrived on the seeded PRs** (Nov 23): authors and reviewers have IDs (`…/tp:<Bitbucket user ID>`) but `name: null`. Baton recognises the departing person by the ID on most PRs linked to their issues (`inferSubjectId` in `app/src/enrich/pullRequests.ts`) and counts the others as `unnamedOthers`. If a reviewer can't be matched, the PR gets no reviewers, so "No other reviewer" can't fire wrongly. Bitbucket's public user lookup doesn't resolve these IDs.
  - **Ruled out:** Bitbucket's API from the app (Forge refuses Bitbucket scopes alongside Jira and Confluence ones: "Workspace scopes can not be used with site scopes") and Jira's `/rest/dev-status` API ("Authentication Required" from Forge; it only takes a browser session).

**Code**

- [x] **Jira fallback.** `saveInventory` asks Jira's search API, as the user, for each issue's updated date and sprint end, so the "stale" and "sprint ends" signals now fire for Jira issues. If the lookup fails, it scores from the graph alone. Verified on the demo site (Nov 22): SALES-24, untouched since March 2025, got its date from Jira and the "Stale" reason.
- [x] **Page link counts** for the "widely referenced" signal (Nov 22). The graph's `content_entity_links_entity` relationship gives a page's incoming links: tested with three pages linking to one, two with native page links and one with a plain URL, and all three showed up within about 4 minutes. `buildInventory` runs the saved query `PQ_PAGE_INBOUND_REFS` per page and sets `inboundLinks`. (`entity_links_entity` returned nothing.)
- [x] **Pull request query without `roles`** (Nov 22). `roles` started failing even as `[CREATED, REVIEWED]`, so the query leaves it off and the converter keeps only PRs the person wrote or reviews.

**LLM**

- [ ] **Mistral setup.** Create the account and key, turn on the training opt-out if there is one, send you the key, and pin exact model IDs instead of the "latest" aliases.
- [x] **Tried the three LLM calls on seed data** (Nov 23). Groq's JSON mode works and the questions are concrete. Fixed on the way: item refs (`I1`) leaked into the text, so bare refs now become the item's key or title; risks now name the item; and the one-liners were never requested, so the inventory build now asks for them after saving. **(affects you)**

**Scoring**

- [x] **Tuned the risk weights on seed data** (Nov 23). "Widely referenced page" went from +15 to +20: pages can't be mid-flight or due soon, so Meera's runbook (only she knows it, 4 pages link to it) was stuck at 55, Medium. It's now 60, High. Nothing else needed changing.

**Agent and MCP**

- [x] **Wrapped `get-handover` and `find-owner` as `rovo:skill`s** (Nov 26), for the Best Agents prize. `handover-briefing` (uses `get-handover`, and `list-handovers` when the name doesn't match) and `find-new-owner` (uses `find-owner`) live in `app/skills/*/SKILL.md`, and the agent lists both. `app/test/skills.test.ts` applies the same rules as Forge's validator. Not run in Rovo yet: after the next deploy, ask "What did Meera leave unfinished?" and "Who owns PAY-1 now?" and check the answers follow the skills (top risks with reasons and owners; accepted vs suggested owner).
- [ ] **Check the agent's four suggested questions** give correct, cited answers in Rovo and in Claude Desktop, before Dec 14.
- [x] **Fix the agent's people links.** The actions return `personLink`, `currentOwnerLink` and `newOwnerLink`: a ready-made Markdown link, `[Meera Iyer](<site>/jira/people/<accountId>)`, and the agent prompt says to copy it exactly. (Nov 24: replaced the separate `*Url` fields, after Rovo showed Meera as a bare profile URL. Recheck in Rovo after the next deploy.)
- [x] **Baton showing up twice in the Rovo picker.** That came from per-product installs; with one installation it shows once (Nov 22).

**Loose ends**

- [ ] **Add the goal and project graph scopes** to the manifest, with exact names from the Scopes page.
- [ ] **Check the storage size limit** against a full handover.
- [ ] **Remove the dev-only page before submission:** the `/dev` route, `app/ui/src/screens/DevPage.tsx`. (The `devGraphQuery` resolver is gone: `graphQuery` replaced it and only runs Baton's own queries.)
- [x] **Category: Apps for Software Teams** (decided Nov 22). The spec recommended Business Teams, but the demo story (Northwind Pay engineers, PRs, Jira) is a software team's. Frame the video and Devpost text for dev teams: unreviewed PRs, the knowledge only one engineer has. **(affects you)**
- [ ] **Marketplace bonus: decide on Dec 7**, once the MVP is demo-able. If there's slack then, submit a paid listing for review (a review ticket is enough for the prize; see section 6).
- [ ] **Check her employment contract** for side-project clauses.

**Dates:** go/no-go Nov 23. MVP demo-able on her dev site by Dec 7: start a handover, build the inventory, capture answers. Feature freeze Dec 14.

## Open questions

- Why does the browser bridge get a 403 on teams when the backend doesn't? Worked around with `graphQuery`; worth a reply on the forum thread.
