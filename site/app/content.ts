// Everything the page says that comes from the product. Keep it in step with the app:
// scoring weights with app/src/scoring/risk.ts, tools with app/manifest.yml (rovo:action inputs).

/** Example rows from the Northwind Pay demo (scripts/seed/story.ts), shown in the hero. */
export const exampleRows = [
  { score: 75, title: 'Exponential backoff for card declines', why: 'only Meera · mid-flight · due after', to: 'Arjun' },
  { score: 60, title: 'PR #1 jittered backoff in retry worker', why: 'only Meera · open', to: 'Arjun' },
  { score: 60, title: 'PR #2 retry thresholds to config', why: 'only Meera · open', to: 'Lin' },
  { score: 60, title: 'DLQ replay tool for failed retries', why: 'only Meera · mid-flight', to: 'Dana' },
  { score: 60, title: 'Retry service memory limits', why: 'only Meera · mid-flight', to: 'Sam' },
  { score: 60, title: 'Payment retry service runbook', why: 'only Meera · 4 inbound links', to: 'Dana' },
];

/** The knowledge-risk signals and their points (app/src/scoring/risk.ts). */
export const rules = [
  { signal: 'Nobody else has worked on it', points: 40 },
  { signal: 'Only one other person has context', points: 20 },
  { signal: 'Work is mid-flight', points: 20 },
  { signal: 'Due before, or within a week after, the last day', points: 15 },
  { signal: 'Open PR whose only reviewer is them', points: 15 },
  { signal: 'Page linked from 3 or more other pages', points: 20 },
  { signal: 'Open and untouched for 30+ days', points: 10 },
];

/** The five Rovo and MCP actions, with their inputs (? = optional). */
export const tools = [
  ['list-handovers', '{ status? }'],
  ['get-handover', '{ person }'],
  ['find-owner', '{ item: "PAY-1" }'],
  ['list-at-risk-items', '{ person?, minRisk: 60 }'],
  ['start-handover', '{ person, reason, lastDay }'],
] as const;

export const steps = [
  {
    title: 'Build the inventory',
    body: 'Pick the person and their last day. Baton reads their open Jira issues, pull requests, pages and goals through Teamwork Graph, as you, and scores every item from 0 to 100.',
  },
  {
    title: 'Ask what isn’t written down',
    body: 'Baton drafts questions about the riskiest items. The person leaving answers them in one screen, and each answer stays attached to the work it explains.',
  },
  {
    title: 'Publish and reassign',
    body: 'Publish the handover to Confluence with new owners @mentioned, then reassign the Jira issues after a dialog that lists every change.',
  },
];

export const facts = [
  { title: 'Teamwork Graph', body: 'Reads Jira, Bitbucket, Confluence and Goals in one pass, with the signed-in user’s permissions.' },
  { title: 'Forge storage', body: 'Handovers stay on your Atlassian site. Nothing is kept on outside servers.' },
  { title: 'Pseudonymized prompts', body: 'People become P1, P2 before any text reaches the language model, and come back after.' },
  { title: 'Works without the LLM', body: 'If the model is down, the scored inventory, owners and reassignments still work.' },
];

// The Forge installation link (developer console → Baton → Distribution, production, "Sharing with anyone").
// Regenerating the link there invalidates this one.
export const installUrl =
  'https://developer.atlassian.com/console/install/83b0292d-c06a-4bec-9e04-426a67cb0280?signature=AYABeGM8n1WGNfF4p09SQsgfNuoAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4CxqLTo9l4lqXuFjNim1xJM%2Bp%2F3TVP9xHS2BrU5DRRucBmRtiDFhQMxqZzvv%2FxngUQQAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDCL%2Fp3uQBq4oGeJZyQIBEIA7XdT8fdBd3kViVfzrPrdNveidVn0gaCozraHb4XWpi65snlw1gICg5nOcMOpFTAqBG6sUQNwGB1jUBnYAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHi9bVMAkme4qVQX1fQHo6ePw3H40A7cGfz7yrmSfBWMXgEvfoARPhkyCdd8zaMnhmI7AAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQM2C3WeJ4RSz4vB5bUAgEQgDtayJ8kZ3SJ9js7pxjnkRTDHV7BjDTfwpW8736KQDGoB6hHIUeqEJzdM05v6PLAV%2BU9IS%2B0yv581I96KAAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeDYASx0XCjkny4iLV6vz%2BKtEGSGT6kdt0QRpkn6D%2FlVEAb4jU6CIePF0WVLkTsK%2BhU0AAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAzQu1riXpPuPrmkpyUCARCAO2SuQ7i3uIZKVeZgFDK3W4cr%2Bp9y8cc1%2BCA%2BOwqbfoHPYt1I3P1uUxLQ4vClUHSjJHVTGJCXrPM2NEsCAgAAAAAMAAAQAAAAAAAAAAAAAAAAAHQtOc0SK6BuQ4oEGl%2BDylz%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADJCA11mHxk3CaEcbfb4GtIkApY8pSWLLT2mVlEiYvJd%2FMZzss8FxPja61pbwCksheJpI1KnwcIWGCPCbYEPGa482Nc%3D&product=jira&product=confluence';
