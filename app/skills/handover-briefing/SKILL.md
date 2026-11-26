---
name: handover-briefing
description: Briefs someone on a departing teammate's Baton handover - what they left unfinished, which items are riskiest and why, who takes each one over, and what the person said in their answers. Use when asked what someone left behind, what is at risk in their handover, or where their handover stands.
allowed-tools: get-handover list-handovers
---

# Handover briefing

Use this skill when someone asks about a person's handover: "What did Meera leave unfinished?", "What's risky in Arjun's handover?", "Where is Lin's handover at?".

## Steps

1. **Find the person.** If the user names someone, call `get-handover` with `person` set to the name or account ID they gave. A first name is enough.
2. **If `get-handover` returns a `result` saying no handover was found**, call `list-handovers` to see the handovers the user can see.
   - If one is clearly the same person under a different spelling, call `get-handover` again with that name.
   - Otherwise say there's no handover for them, and offer to start one.
3. **If the user named nobody**, call `list-handovers`. With one handover, brief on it. With several, list them (each person's `personLink`, reason, last day and status) and ask which one.
4. **If either action returns an `error`**, tell the user plainly what it says.

## Writing the briefing

Keep it short and lead with what needs attention.

1. **One line on the handover:** the person's `personLink`, the `reason` (leaving, leave or team change), `lastDay` and `status`. If `overview` isn't null, add it in a sentence or two.
2. **The riskiest work.** Take up to 5 entries from `topRisks`, which come highest risk first. For each:
   - its `itemLink` copied exactly (the title as a link), with the `key` if there is one
   - why it's risky, from `reasons`, in plain words (for example "only Meera has worked on it, and it's due right after she leaves")
   - who takes it: their `newOwnerLink`, or "no owner yet" when it's null
3. **What they said.** If `answeredQuestions` isn't empty, pass on the answers that matter for the risky items, briefly and in their words.
4. **The rest.** If `itemCount` is bigger than the items you showed, say how many more are in Baton, and end with the handover's `link`.

## Rules

- Use only what the actions return. Never invent items, owners, dates or answers.
- Copy `personLink` and `newOwnerLink` exactly: each is a Markdown link with the person's name as its text. Never show a bare profile URL, and never build one.
- `band` is the risk level: say "high", "medium" or "low" rather than quoting the `risk` number, unless the user asks for scores.
