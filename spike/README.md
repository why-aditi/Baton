# Baton week-1 spike (go/no-go by Nov 23)

Throwaway Forge app. One page in Jira with a button per spike, plus a hello-world Rovo agent and MCP server.

## Run

```sh
npm i -g @forge/cli && forge login
cd spike && forge register            # writes the real app.id into manifest.yml
forge variables set --encrypt GROQ_API_KEY <key>
forge variables set GROQ_MODEL <model id from console.groq.com>   # optional
forge deploy && forge install --site <dev-site>.atlassian.net --product jira
forge install --site <dev-site>.atlassian.net --product confluence  # only if publish fails without it
forge logs -f                         # in a second terminal
```

Open Jira → Apps → **Baton spike**. Org admin rights are needed to grant the graph scopes.

## Gates

| # | Spike | Pass when | If it fails |
|---|-------|-----------|-------------|
| 1 | **Probe Teamwork Graph** with Meera's accountId | `assignedJira.count > 0`, `pullRequests` shows PRs (note the `__typename`), `teams.count > 0` | PRs empty → link Bitbucket to the org, then fall back to Bitbucket REST. Empty with no errors usually means a missing scope |
| 1b | Register `PQ_USER_OWNED_PAGES` in TWG Labs (no curated user→pages query exists) | Query Builder returns Meera's pages | Fall back to Confluence REST CQL `creator = <accountId>` |
| 2 | **Ping Groq** | `status: 200` and a JSON reply | Check `forge logs`; egress is limited to `api.groq.com` |
| 3 | Rovo chat → agent **Baton** → "List open handovers" | Answers with Meera's fake handover; log shows `list-handovers called` | Ask in the Nov 17 build session whether Rovo runs on free dev sites |
| 3b | Admin → Apps → Sites → Connected apps → enable MCP, then Claude Desktop → `https://mcp.atlassian.com/forge/<appId uuid>` | Tool `list-handovers` is listed and runs | Show it in Rovo Studio only |
| 4 | **Publish test page** with a space key | Returns a page URL | 401/403 → try a Confluence install (step above). Still failing → in-app page plus "Copy as Confluence markup" |

Also confirm `rovo:skill` exists (it does in Preview: `manifest-reference/modules/rovo-skill`) and check the KVS value size limit.
