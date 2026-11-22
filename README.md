# Baton

Baton turns a departing teammate's scattered work into a ranked handover in minutes. It finds every open item they own across Jira, Bitbucket and Confluence, scores each one for knowledge risk ("only this person has touched it"), suggests who should take it over, and asks the person targeted questions to capture what's only in their head before their last day.

It's a Forge app for Jira, built for Codegeist 2026 (Business Teams), and aims at the Best Agents, Atlassian MCP and Teamwork Graph bonus prizes.

## How it works

```
Baton app page (Jira) ──reads Teamwork Graph as the user──►  Teamwork Graph
        │ invoke
        ▼
   Resolvers  ──scoring, storage, Jira/Confluence REST──►  Forge storage, Jira, Confluence
        │
        └──anonymized prompts only──►  Groq, then Mistral

Rovo chat (baton-agent) ─┐
                         ├──►  5 shared actions  ──►  Forge storage
Claude Desktop (MCP) ────┘
```

- The app page reads Teamwork Graph in the browser, as the signed-in user, so people only see work they already have access to.
- Risk and owner scores are deterministic, unit-tested code. The LLM only writes language: questions, one-line item summaries and the handover narrative.
- Only anonymized prompts leave Atlassian. People become P1, P2… and items I1, I2…, and every LLM answer is checked against the items it was given.
- The Rovo agent and the MCP server share the same five actions: `list-handovers`, `get-handover`, `find-owner`, `list-at-risk-items` and `start-handover`.

## Repository

| Path | What |
| --- | --- |
| `app/` | The Baton app. See [app/README.md](app/README.md) |
| `scripts/` | Seed scripts for the Northwind Pay demo company, plus reset. See [scripts/README.md](scripts/README.md) |
| `spike/` | The week-1 test page, now also used to record Teamwork Graph fixtures |
| `Baton — Codegeist 2026 Tech Spec.pdf` | The spec: scope, design, data model, timeline |
| `SETUP-KESHAV.md` | Dev setup: Forge CLI, your own environment and demo site, Rovo, MCP |

## Status (Nov 22, 2026)

| Area | State |
| --- | --- |
| Week-1 spikes (graph, Groq, Rovo, MCP, Confluence publish) | Pass |
| Risk scoring, owner ranking, LLM layer, storage, resolvers, Rovo/MCP actions | Built and unit-tested; deployed to the dev site Nov 22 |
| Graph paging, merging, scope self-check | Built and unit-tested |
| Turning graph results into items, building the inventory | Built and tested against responses recorded on the demo site (Nov 22) |
| Confluence publish and reassign (backend) | Built and unit-tested (Nov 22) |
| Custom UI | Not started |
| Seed data (Northwind Pay) | Scripts written and tested against fakes (`scripts/`); not yet run on a site. Due Nov 30 |

## Develop

Needs Node.js 22.

```sh
cd app
npm install
npm test            # unit tests, no site needed
npm run typecheck
```

To deploy and install on a site, follow [SETUP-KESHAV.md](SETUP-KESHAV.md). Installing needs organization admin rights, because the app uses Teamwork Graph scopes.

## Team

Aditi owns graph, scoring, LLM and agent work. Keshav owns the UI, seed data and publishing.
