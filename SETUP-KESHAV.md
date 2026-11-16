# Baton dev setup for Keshav

Nov 16, 2026 · from Aditi

All four week-1 spikes pass, so you're setting up on a stack that already works end to end. This gets you your own copy: the Baton Forge app on your own environment and demo site, connected to Rovo, Claude Desktop (MCP) and Groq. Plan on about an hour.

| Spike | Result on Nov 16 |
| --- | --- |
| Teamwork Graph reads from the app page | Works. New activity is indexed within ~5 min. Team lookups fail with a 403 ([forum thread](https://community.developer.atlassian.com/t/teamwork-graph-atlassianuserinteams-returns-edges-but-every-node-fails-with-teamsv2-status-code-is-403/103977)) |
| Groq call from a Forge resolver | Works |
| Rovo agent "Baton" | Works in Ask Rovo |
| MCP from Claude Desktop | Works |
| Confluence page published from the Jira app | Works, as the signed-in user |

The code is in `spike/`. Aditi's site is `one-atlas-ubvd.atlassian.net`; you'll get your own.

## 1. Before you start

**Aditi does these first:**

- [ ] Push the repo to the private GitHub repo and add you. It isn't on GitHub yet.
- [ ] Add you to the Developer Space that owns the app (developer.atlassian.com/console). Without this, `forge deploy` fails for you.
- [ ] Send you the Groq API key through a password manager, not chat.

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
7. Deploy and install on both products:
    ```
    forge deploy -e keshav
    forge install -e keshav -p Jira -s <your-site>.atlassian.net --confirm-scopes
    forge install -e keshav -p Confluence -s <your-site>.atlassian.net --confirm-scopes
    ```
8. Open Jira → Apps → **Baton spike**.

Use `forge logs -e keshav -f` in a second terminal while testing.

## 3. Connect Rovo, MCP, Bitbucket

**Rovo agent.** Nothing to set up. On your demo site, click **Ask Rovo** (top right), open the agent picker, search "Baton" and ask "List open handovers". Two Baton entries show up, probably one per product install; either works.

**MCP for Claude Desktop.** Do this on **both** installs; tools stay hidden until both are on:

1. admin.atlassian.com → your org → Apps → Sites → your site → **Connected apps**.
2. Search "Baton", expand it, and open **View app details** for the Jira install.
3. Under **Tools → Expose tools to MCP-compatible apps**, click **Enable tools**, then **Enable**.
4. Repeat for the Confluence install.
5. Claude Desktop → Settings → Connectors → **Add custom connector**. Name `Baton`, URL `https://mcp.atlassian.com/forge/83b0292d-c06a-4bec-9e04-426a67cb0280`. Sign in and pick **your** site.
6. You should see **List handovers (development)**. Ask "List open handovers".

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
- **MCP calls carry no `accountId` in the payload**, unlike Rovo agent calls. The real access checks need another way to identify the caller.
- **Saved graph query keys are tied to the app ID**, so `src/graph/queryKeys.js` works on your site too. Changing a query means registering a new one and getting a new key.

## Open questions

- Two Baton agents in the Rovo picker: expected with one install per product, or should the agent live on one product only?
- Do Bitbucket PRs show up in `atlassianUserPullRequests` once Bitbucket is linked?
- Fix for the teams 403: watch the forum thread.
