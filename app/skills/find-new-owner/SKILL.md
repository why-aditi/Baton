---
name: find-new-owner
description: Finds who owns a piece of work now that the person who had it is leaving - a Jira issue, a Bitbucket pull request or a Confluence page that is in a Baton handover - and why they were chosen. Use for questions like "Who owns PAY-1 now?" or "Who took over the retry runbook?".
allowed-tools: find-owner
---

# Find the new owner

Use this skill when someone asks who has a piece of work now: "Who owns PAY-1 now?", "Who's taking over the retry runbook?", "Who should I ask about this PR?".

## Steps

1. **Pick out the item** from the question, in this order of preference:
   - a Jira issue key such as `PAY-1`, as written
   - a pull request URL, as written
   - otherwise the words of the page or issue title (for example `payment retry runbook`)
2. **Call `find-owner`** with `item` set to that.
3. **If it returns a `result` saying the item is not in a handover**, say so: Baton only knows owners for work in an open handover. If you searched by title words, ask for the issue key or the link and try once more.
4. **If it returns an `error`**, tell the user plainly what it says.

## Answering

Start with the item, `item.title` linked to `item.url` (with `item.key` if there is one), then the owner. What to say depends on `ownerStatus`:

- **`accepted`:** the manager has decided. "{newOwnerLink} owns it now", then the `reason`.
- **`suggested`:** nobody has decided yet. "Baton suggests {newOwnerLink}", then the `reason`, and say the manager hasn't confirmed it.
- **`none`:** no owner yet. Say so, and that the manager can pick one in the handover.

Then add who had it before, their `currentOwnerLink` (the person the handover is for), and end with the handover's `link`.

## Rules

- Use only what `find-owner` returns. Never guess an owner, and never name someone the action didn't.
- Copy `newOwnerLink` and `currentOwnerLink` exactly: each is a Markdown link with the person's name as its text. Never show a bare profile URL, and never build one.
