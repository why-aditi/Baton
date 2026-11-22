# Seed scripts: Northwind Pay

These scripts create the demo company Baton is shown on, through the REST APIs, as the real users, so Teamwork Graph indexes it. The demo site's pre-loaded data doesn't show up in the graph.

**The story.** Northwind Pay is a 7-person fintech team. Meera Iyer, a senior engineer, is leaving. She quietly owns the payment-retry service: its runbook, two open PRs and most of its in-flight Jira work exist only in her head. Everything is in `seed/story.ts`.

| What | Amount | Notes |
| --- | --- | --- |
| Users | 7 | Meera, Arjun, Lin, Priya (the manager who runs the handover), Sam, Dana, Omar |
| Jira issues | 59 in PAY and PLAT | 14 open and assigned to Meera: 6 in progress, 6 due within a week of her last day, 7 nobody else has touched |
| Confluence pages | 12 in one space | 4 only Meera has touched, including the payment-retry runbook, which 4 other pages link to |
| Bitbucket PRs | 6 in `payments-service` | 2 by Meera with no other reviewer, 1 she reviews for Arjun. Titles carry Jira keys |

## 1. Set up the site (once, by hand)

The scripts don't create accounts, projects or spaces, because those need admin rights and change rarely.

1. **Users.** Invite 7 users with email aliases you control (`you+meera@…`, `you+arjun@…`, and so on) and give each access to Jira, Confluence and Bitbucket. Sign in as each one and create an API token at id.atlassian.com/manage-profile/security/api-tokens.
2. **Jira projects.** Create `PAY` (Payments) and `PLAT` (Platform). Both need a **Task** issue type with **Due date** on its create screen, and all 7 users must be able to create, comment on, assign and transition issues. A different issue type name goes in `SEED_ISSUE_TYPE`.
3. **Confluence space.** Create `NWP` (Northwind Pay), or another key in `SEED_SPACE_KEY`, where all 7 can add and edit pages.
4. **Bitbucket.** Use the workspace that's linked to the Jira site (SETUP-KESHAV.md section 3) and add all 7 users to it. Bitbucket may not accept the token from step 1. If it doesn't, create an API token with Bitbucket scopes for each person (reading and writing repositories and pull requests; Meera also needs to create repositories) and put it in `SEED_<NAME>_BITBUCKET_TOKEN`.
5. **Teams.** In the Teams app, create **Payments** (Meera, Arjun, Lin, Priya, Omar) and **Platform** (Meera, Priya, Sam, Dana).
6. **Goals and projects.** There is no REST API for these, so in Atlassian Home create 2 goals and 1 project. Meera owns 1 goal ("Reduce failed payment retries by 30%"), Priya owns the other ("Close the books in 2 days"), and Priya owns the project ("Retry service v2").

## 2. Run

Needs Node.js 22.

```sh
cd scripts
npm install
cp .env.seed.example .env.seed     # then fill it in; it's git-ignored
npm run seed                       # Jira, then Confluence, then Bitbucket
```

Or one product at a time: `npm run seed:jira`, `npm run seed:confluence`, `npm run seed:bitbucket`. Run Jira first, because PR titles use the Jira keys.

Every script is safe to run again:

- **Jira:** issues are found by their `seed-<id>` label. A rerun creates missing ones and puts back any assignee or status that changed.
- **Confluence:** pages are found by title. Existing pages are left alone.
- **Bitbucket:** a PR is found by its branch. A rerun opens only the missing ones.

Give the graph time to catch up after seeding (5 minutes for new activity, sometimes longer), and **don't reseed the day before recording**.

## 3. Reset between demo runs

```sh
npm run reset
```

This puts every seeded Jira issue back to its story assignee and status (undoing Baton's reassignments) and deletes the handover pages Baton published in the seed space. Baton's handovers themselves live in Forge storage, which only the app can reach. Delete them as a Jira admin from the Baton page: run the `deleteAllHandovers` resolver with `{"confirm":"DELETE"}`.

## Things the seed can't fake

- **"Stale" chips.** An issue counts as stale after 30 days without an update, and Jira won't let you backdate one. Issues seeded on Nov 30 won't be stale until Dec 30. The other chips (Only Meera, Mid-flight, Due after last day, No other reviewer) show right away.
- **Issue keys.** Keys are given out in creation order, so on fresh projects the hero issue is `PAY-1`, not the `PAY-142` the agent's suggested questions mention. After seeding, update that suggested question in `app/manifest.yml` to the hero's real key.
- **"Widely referenced" chips.** The runbook is linked from 4 pages, but Baton can't count page links yet (SETUP-KESHAV.md section 8), so this chip doesn't show.

## Tests

`npm test` runs the scripts against in-memory fakes of Jira, Confluence and Bitbucket. It checks the story against the spec's numbers, that a rerun changes nothing, and the exact requests each adapter sends. `npm run typecheck` checks types. No site or token is needed for either.
