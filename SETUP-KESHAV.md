# Baton dev setup for Keshav

Nov 16, 2026 · from Aditi · updated Nov 16 with the real app in `app/`

All four week-1 spikes pass, so you're setting up on a stack that already works end to end. This gets you your own copy: the Baton Forge app on your own environment and demo site, connected to Rovo, Claude Desktop (MCP) and Groq. Plan on about an hour.

| Spike | Result on Nov 16 |
| --- | --- |
| Teamwork Graph reads from the app page | Works. New activity is indexed within ~5 min. Team lookups fail with a 403 ([forum thread](https://community.developer.atlassian.com/t/teamwork-graph-atlassianuserinteams-returns-edges-but-every-node-fails-with-teamsv2-status-code-is-403/103977)) |
| Groq call from a Forge resolver | Works |
| Rovo agent "Baton" | Works in Ask Rovo |
| MCP from Claude Desktop | Works |
| Confluence page published from the Jira app | Works, as the signed-in user |

The repo has two apps: `spike/` (the week-1 test page, which sections 2–5 below set up) and `app/` (the real Baton, see section 7). Aditi's site is `one-atlas-ubvd.atlassian.net`; you'll get your own.

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
3. Get a Codegeist demo site: `forge site provision`. It takes several minutes; rerun the same command to check progress. Your site comes with Jira, Confluence, Rovo, Studio and sample data, and lasts 90 days. **Provision before Nov 20** so it's still alive for judging (Jan 5 – Feb 3).
4. Clone the repo, then:
    ```
    cd spike
    npm install
    ```
5. Create your own Forge environment, so your deploys don't overwrite Aditi's:
    ```
    forge environments create
    ```
    Name it `keshav` when asked. Check `forge environments --help` if the flags differ.
6. Set the Groq key in your environment:
    ```
    forge variables set --encrypt -e keshav GROQ_API_KEY <key>
    ```
7. Deploy, install in Jira, then connect Confluence. `app/manifest.yml` declares Jira as the required product and Confluence as optional, so both commands add to **one** installation. `forge install list` shows it as `Jira (required)` plus `Confluence`.
    ```
    forge deploy -e keshav
    forge install -e keshav -p Jira -s <your-site>.atlassian.net --confirm-scopes
    forge install -e keshav -p Confluence -s <your-site>.atlassian.net --confirm-scopes
    ```
8. Open Jira → Apps → **Baton spike**.

Use `forge logs -e keshav -f` in a second terminal while testing.

## 3. Connect Rovo, MCP, Bitbucket

**Rovo agent.** Nothing to set up. On your demo site, click **Ask Rovo** (top right), open the agent picker, search "Baton" and ask "List open handovers". Two Baton entries show up, probably one per product install; either works.

**MCP for Claude Desktop.**

1. admin.atlassian.com → your org → Apps → Sites → your site → **Connected apps**.
2. Search "Baton" and open **View app details**. It should say "Connected to Jira (Required), Confluence". If you see two separate Baton entries, the app was installed per product: see section 6.
3. Under **Tools → Expose tools to MCP-compatible apps**, click **Enable tools**, then **Enable**.
4. Claude Desktop → Settings → Connectors → **Add custom connector**. Name `Baton`, URL `https://mcp.atlassian.com/forge/83b0292d-c06a-4bec-9e04-426a67cb0280`. Sign in and pick **your** site.
5. You should see the five Baton tools. Ask "List open handovers". After any install change, **Disconnect** the connector and connect again.

**Bitbucket.** Not done yet, and PRs are a big part of the demo. Add Bitbucket to your org (admin.atlassian.com → Add app), create a workspace and one repo, then check that PRs appear in the probe. Untested: we don't know yet whether the graph needs anything more.

**Groq.** Covered by step 6 above. The app only calls `api.groq.com`.

## 4. Seed data (your workstream)

**The demo site's pre-loaded data doesn't show up in Teamwork Graph.** Alana Grant has 36 open issues in Jira, and the graph returns 0 for her. A new issue created via the API showed up within 5 minutes. So all Northwind Pay data must be created fresh, through the API or UI, by the real users.

- Invite 7 users to your site using email aliases you control (for example `you+meera@...`). Each needs their own API token, so authorship is real.
- Write `scripts/seed/seed-jira.ts`, `seed-confluence.ts` and `seed-bitbucket.ts` as idempotent scripts, plus `reset.ts`, as in the spec.
- Meera's hero item: payment-retry runbook page and 2 open PRs that only she has touched, plus 14 assigned issues.
- **Seed by Nov 30.** Don't reseed the day before recording; indexing can lag.
- Create the 2 teams (Payments, Platform) in the Teams app, but expect team lookups to fail until the forum thread is answered.

## 5. Check it works

- [ ] Baton spike page loads in Jira
- [ ] **Probe Teamwork Graph** with no account ID: `assignedJira` lists any issue assigned to you (create one if needed, wait 5 min)
- [ ] Probe with a seeded user's account ID returns their issues and, after seeding, `ownedPages`
- [ ] **Ping Groq** returns status 200
- [ ] **Publish test page** with a space key returns a page URL
- [ ] Ask Rovo → Baton → "List open handovers" answers
- [ ] Claude Desktop → "List open handovers" answers
- [ ] `forge logs -e keshav` shows `list-handovers called` for both

To find an account ID: open the person's Jira profile; the ID is the last part of the URL.

## 6. Gotchas we already hit

- **Graph queries need an operation name** of the form `company_operation`, e.g. `query baton_assignedWork(...)`, or they're rejected.
- **`JiraWorkItem` has no `title` field**, even though the docs example uses one.
- **Graph edges can be `null`** (rows the caller can't read). Skip them, don't crash.
- **The saved pages query returns each page twice** (owns + created). Deduplicate by ARI.
- **`first` is capped at 25.** Paginate with `pageInfo.endCursor`.
- **Publish to Confluence as the user** (`asUser()`). As the app it can't see any spaces.
- **`@forge/resolver` import:** Forge CLI 14.2 wraps the default export one level too deep. Keep the unwrap at the top of `src/index.js`.
- **UI Kit text fields:** a controlled `Textfield` (with `value=`) drops typed characters. Leave `value` off.
- **No `"type": "module"` in `package.json`.** It breaks the bundle.
- **Groq models:** the account has no Llama models. Use `openai/gpt-oss-20b` (fast) or `openai/gpt-oss-120b` / `qwen/qwen3.8-27b` (large).
- **Never log a whole action payload.** It contains a signed `contextToken`.
- **MCP calls carry no `accountId` in the payload**, unlike Rovo agent calls. The actions ask Jira's `/myself` instead, which works from both.
- **The app must be one installation across Jira and Confluence** (the `compatibility` block in `app/manifest.yml`). Installed separately per product, each install has its own storage, and Forge runs Claude Desktop (MCP) calls through the Confluence one, so MCP saw no handovers. A Jira-only install doesn't work either: Confluence calls fail with `403 The app is not installed on this instance`. If you ever see two Baton entries under Connected apps, uninstall the Confluence one (`forge install list`, then `forge uninstall -i <id>`) and run the Confluence install again.
- **Multi-product apps can't have a free Marketplace listing.** It must be paid, which matters for the Marketplace bonus decision.
- **Saved graph query keys are tied to the app ID**, so `src/graph/queryKeys.js` works on your site too. Changing a query means registering a new one and getting a new key.

## 7. The real app (`app/`)

`app/` holds the backend: scoring, the LLM calls, storage, the app page's resolvers, and the five Rovo/MCP actions. The UI isn't built yet. `app/README.md` has the details, including the full resolver table.

**Run the tests** (no site or login needed):
```
cd app
npm install
npm test
npm run typecheck
```

**Deploying it.** `app/manifest.yml` uses the same app ID as the spike, because the saved graph query keys belong to the app ID. So **deploying `app/` to an environment replaces the spike there.** Keep the spike in your `keshav` environment until any graph fixtures you're recording are saved, then:
```
cd app
forge variables set --encrypt -e keshav GROQ_API_KEY <key>
forge variables set --encrypt -e keshav MISTRAL_API_KEY <key>   # optional fallback
forge deploy -e keshav
forge install --upgrade -e keshav
```
The upgrade asks you to approve new scopes (Jira read/write, user read, app storage) and the new Mistral host.

**What's yours in `app/`:**

- **The Custom UI.** `app/static/ui/index.html` is a placeholder so the app deploys. Build the UI (React + `@atlaskit`) and point `resources` in the manifest at its build output.
- **Calling the backend.** Use `invoke(name, payload)` from `@forge/bridge`. Every resolver returns `{ ok: true, data }` or `{ ok: false, error: { code, message } }`. A `not_found` code also means "no access", so show the same empty state either way.
- **Routing.** Links from the Rovo agent go to `<site>/jira/apps/<appId>/<envId>/handover/<id>`. The UI should route on `/handover/<id>`.
- **Who sees what.** `getHandover` returns `{ role: 'editor', handover }` for the manager, recipients and Jira admins. For the departing person it returns a questions-only view (`role: 'subject'`). Render the knowledge-capture screen for `subject` and the inventory for `editor`.
- **Reading the graph.** Graph reads happen in the UI, as the user. Call `buildInventory({ request, subjectAri, ownedPagesQueryKey: PQ_USER_OWNED_PAGES, onProgress })` from `app/src/graph/inventory.ts`, with `request = (query, vars) => requestTeamworkGraph(query, vars)` from `@forge/bridge`. It returns `{ items, teams, openAssigned, people, warnings }`: send everything except `warnings` to `saveInventory` with the handover `id`, and show `warnings` as banners. `onProgress` reports each source (`assignedJira`, `reportedJira`, `pullRequests`, `pages`, `goalsAndProjects`, `teams`, then `details`) for the progress bar. It makes a few dozen graph calls, so expect several seconds.
- **The LLM can fail.** `generateQuestions` and `generateSummary` return `llm_unavailable` when both LLM providers fail or the hourly limit (20 calls per site) is hit. Show the error and keep the rest of the screen working. The inventory never depends on the LLM.
- **Publish and reassign: the backend is done**, so the UI only calls it.
  - `publishHandover({ id, spaceKey })` needs a summary, creates the Confluence page as the user, and moves the handover to Published. It returns the handover with `confluencePageUrl`. A missing space or a duplicate title come back as `bad_input` / `conflict` with a message you can show.
  - `reassignIssues({ id, itemAris })` assigns each Jira issue to its accepted owner, as the user, and returns `{ results: [{ ari, key, accountId, ok, error? }] }`. One failure doesn't stop the rest. Show the confirmation dialog listing every change **before** calling it, then show any failed rows.
- **Dev harness.** `app/static/ui/` currently has a small page that calls any resolver by name with a JSON payload (`dev.js`). Delete both files when your UI build replaces the placeholder.

**Still open on Aditi's side:** see section 8.

**Gotchas, in addition to section 6:**

- **`Item` fields matter to scoring.** Set `statusCategory` (an open PR is `in_progress`), `reviewers` on PRs, `dueDate` / `sprintEndDate` on issues, `inboundLinks` on pages, and `container` (project key, repo or space) on everything. Missing fields just score lower, silently.
- **People are stored by account ID**, but collaborators and team members are user ARIs (`ari:cloud:identity::user/<accountId>`). Pass display names to `saveInventory` as `people: { accountId: name }`.
- **LLM results are cached.** Calling a generate resolver again returns the stored result unless the inputs changed. Pass `regenerate: true` for a "Regenerate" button.

## 8. Aditi's remaining work

So you know what's coming and what blocks you. Items marked **(affects you)** change what your UI or seed data can rely on.

**Needs her site first** (this unblocks most of the rest)

- [x] **Record what the graph returns.** Done Nov 22: `app/test/fixtures/`, with findings in its README. Re-record once your seed lands.
- [ ] **Check Bitbucket PRs appear in the graph.** **Blocked:** the demo org's Bitbucket workspace is behind an IP allowlist, and turning that off is an admin security change. If they don't show up, PRs come from Bitbucket's REST API instead. **(affects you)**
- [x] **Deploy `app/` and test Rovo and Claude Desktop.** Done Nov 22: both identify the caller, and both see the same handovers now that the app is one installation (section 6).
- [x] **Publish and reassign backend.** Done Nov 22 (section 7). **(affects you)**

**Code, once fixtures exist**

- [x] **Turn graph results into items.** `app/src/graph/normalize.ts`, one converter per query, tested against the fixtures. The queries are checked against the recorded schema in a test.
- [x] **One function that builds the inventory.** `buildInventory` in `app/src/graph/inventory.ts`; see "Reading the graph" in section 7. **(affects you)**
- [x] **Workload counts for owner ranking.** `buildInventory` counts open assigned work for up to 25 likely owners.
- [x] ~~Register `PQ_ITEM_COLLABORATORS`.~~ Not needed for now: `buildInventory` gets collaborators from page contributors and issue commenters instead. Revisit if that's too slow on real data.
- [ ] **Fallbacks** to the Jira, Confluence and Bitbucket APIs for what the graph doesn't return. The graph has no updated date or sprint on Jira issues and no link counts on pages, so the "stale", "sprint ends" and "widely referenced" risk signals never fire for those. Jira's search API (`updated`, sprint) and Confluence's API (incoming links) can fill them in. PRs too, if they don't show up in the graph.

**LLM**

- [ ] **Mistral setup.** Create the account and key, turn on the training opt-out if there is one, send you the key, and pin exact model IDs instead of the "latest" aliases.
- [ ] **Try the three LLM calls on real seed data.** That's questions, one-liners and the summary: check that Groq's JSON mode works and the questions are concrete. **(needs your seed)**

**Scoring**

- [ ] **Tune the risk weights on seed data.** **(needs your seed, due Nov 30)**

**Agent and MCP**

- [ ] **Check whether `rovo:skill` exists.** If it does, wrap `get-handover` and `find-owner` as skills, which helps with the Best Agents prize.
- [ ] **Check the agent's four suggested questions** give correct, cited answers in Rovo and in Claude Desktop, before Dec 14.
- [ ] **Decide why Baton shows up twice in the Rovo picker,** and whether the agent should live in one product only.

**Loose ends**

- [ ] **Add the goal and project graph scopes** to the manifest, with exact names from the Scopes page.
- [ ] **Run `forge lint` while logged in,** and check the storage size limit against a full handover.
- [ ] **Decide the category** by Nov 23 (the spec recommends Business Teams), and whether to go for the Marketplace bonus by Dec 7.
- [ ] **Check her employment contract** for side-project clauses.

**Dates:** go/no-go Nov 23. MVP demo-able on her dev site by Dec 7: start a handover, build the inventory, capture answers. Feature freeze Dec 14.

## Open questions

- Two Baton agents in the Rovo picker: expected with one install per product, or should the agent live on one product only?
- Do Bitbucket PRs show up in `atlassianUserPullRequests` once Bitbucket is linked?
- Fix for the teams 403: watch the forum thread.
