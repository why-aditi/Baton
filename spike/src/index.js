import * as ResolverModule from '@forge/resolver';
import api, { fetch, route } from '@forge/api';

// ponytail: Forge's bundler (CLI 14.2) double-wraps CJS default exports; unwrap whichever shape arrives.
const Resolver = ResolverModule.default?.default ?? ResolverModule.default ?? ResolverModule;
const resolver = new Resolver();

// Spike 2: Groq call from Forge.
const groqPing = async () => {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: 'Reply with JSON {"ok": true, "model": "<your model name>"}' }],
    }),
  });
  const body = await res.json();
  return { status: res.status, reply: body.choices?.[0]?.message?.content ?? body };
};
resolver.define('groqPing', groqPing);

// Spike 4: create a Confluence page from a Jira-hosted app.
const publishPage = async (spaceKey, as) => {
  const spaces = await as.requestConfluence(
    spaceKey ? route`/wiki/api/v2/spaces?keys=${spaceKey}` : route`/wiki/api/v2/spaces?limit=1`,
  );
  if (!spaces.ok) return { step: 'lookup space', status: spaces.status, body: await spaces.text() };
  const space = (await spaces.json()).results?.[0];
  if (!space) return { step: 'lookup space', error: `No space with key ${spaceKey}` };

  const res = await as.requestConfluence(route`/wiki/api/v2/pages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      spaceId: space.id,
      status: 'current',
      title: `Baton spike ${new Date().toISOString()}`,
      body: { representation: 'storage', value: '<p>Published from the Baton Jira app.</p>' },
    }),
  });
  const body = await res.json();
  return { status: res.status, url: body._links ? body._links.base + body._links.webui : body };
};
resolver.define('publishPage', ({ payload: { spaceKey } }) => publishPage(spaceKey, api.asUser()));

export const handler = resolver.getDefinitions();

// Spike 3: one action shared by the Rovo agent and the MCP server.
export const listHandovers = async (payload, context) => {
  // Never log the whole payload: it carries a signed contextToken. Log key names only to find caller identity.
  console.log('list-handovers called', JSON.stringify({
    status: payload?.status,
    accountId: payload?.context?.accountId,
    payloadKeys: Object.keys(payload ?? {}),
    contextKeys: Object.keys(context ?? {}),
    principal: context?.principal?.accountId ? 'has principal.accountId' : 'no principal.accountId',
  }));
  return { handovers: [{ person: 'Meera', reason: 'leaving', lastDay: '2026-11-26', status: payload?.status ?? 'draft' }] };
};
