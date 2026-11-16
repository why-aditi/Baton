import React, { useState } from 'react';
import ForgeReconciler, { Button, CodeBlock, Heading, Stack, Text, TextArea, Textfield } from '@forge/react';
import { invoke, requestTeamworkGraph, view } from '@forge/bridge';
import { PQ_USER_OWNED_PAGES } from '../graph/queryKeys';

// Spike 1: does Teamwork Graph return the person's issues, PRs, teams and pages?
// ponytail: first page only; the real app paginates on pageInfo.endCursor.
const QUERIES = {
  assignedJira: `query baton_assignedWork($userId: ID!) { atlassianUserAssignedJiraWorkItems(userId: $userId, first: 25) {
    edges { node { __typename ... on JiraWorkItem { id } } } pageInfo { hasNextPage } } }`,
  pullRequests: `query baton_pullRequests($userId: ID!) { atlassianUserPullRequests(userId: $userId, first: 25) {
    edges { node { __typename } } pageInfo { hasNextPage } } }`,
  teams: `query baton_userTeams($userId: ID!) { atlassianUserInTeams(userId: $userId, first: 25) {
    edges { node { __typename } } pageInfo { hasNextPage } } }`,
  // No curated user->pages query exists, so pages come from the persisted query below.
  ownedPages: `query baton_ownedPages($queryKey: String!, $queryParams: CypherRequestParams) {
    customQuery(queryKey: $queryKey, queryParams: $queryParams, first: 25) {
      edges { node { columns { key value { __typename ... on CypherQueryResultNode { id data { __typename } } } } } }
      pageInfo { hasNextPage } } }`,
};
const varsFor = (name, userId) =>
  name === 'ownedPages' ? { queryKey: PQ_USER_OWNED_PAGES, queryParams: { userId } } : { userId };

const summarize = ({ data, errors }) => {
  const conn = data && Object.values(data)[0];
  const types = {};
  // Edges (or nodes) can be null: rows dropped for permissions or missing scopes. Count them separately.
  conn?.edges?.forEach((e) => {
    const t = e?.node?.__typename ?? 'null';
    types[t] = (types[t] || 0) + 1;
  });
  return {
    count: conn?.edges?.length ?? 0,
    hasNextPage: conn?.pageInfo?.hasNextPage,
    types,
    sample: conn?.edges?.filter((e) => e?.node).slice(0, 3).map((e) => e.node),
    errors: errors?.map((e) => e.extensions?.code ?? e.message),
  };
};

// Recording tools for the normalizers in app/src/graph. Field names aren't in the public docs we can
// reach, so we read them from the graph itself, then save raw responses as test fixtures.
const CURATED = [
  'atlassianUserAssignedJiraWorkItems', 'atlassianUserReportedJiraWorkItems', 'atlassianUserPullRequests',
  'atlassianUserInTeams', 'atlassianTeamMembers', 'atlassianUserGoalsAndProjects',
  'confluencePageContributors', 'jiraWorkItemComments', 'customQuery',
];
const TYPE_REF = 'name kind ofType { name kind ofType { name kind ofType { name kind } } }';
const typeName = (t) => (t ? (t.name ?? `${t.kind}<${typeName(t.ofType)}>`) : '?');

const inspectTypes = async (names) => {
  const out = {};
  for (const name of names) {
    const q = `query baton_inspect($name: String!) { __type(name: $name) { name kind
      possibleTypes { name }
      fields { name args { name type { ${TYPE_REF} } } type { ${TYPE_REF} } } } }`;
    const { data, errors } = await requestTeamworkGraph(q, { name });
    if (errors) { out[name] = { errors: errors.map((e) => e.extensions?.code ?? e.message) }; continue; }
    const t = data?.__type;
    if (!t) { out[name] = 'no such type'; continue; }
    // The root Query type is huge; keep only the queries Baton uses.
    const fields = (t.fields ?? []).filter((f) => name !== 'Query' || CURATED.includes(f.name));
    out[name] = {
      kind: t.kind,
      possibleTypes: t.possibleTypes?.map((p) => p.name),
      fields: Object.fromEntries(fields.map((f) => [
        f.name,
        f.args?.length ? { type: typeName(f.type), args: Object.fromEntries(f.args.map((a) => [a.name, typeName(a.type)])) } : typeName(f.type),
      ])),
    };
  }
  return out;
};

const App = () => {
  const [accountId, setAccountId] = useState('');
  const [spaceKey, setSpaceKey] = useState('');
  const [out, setOut] = useState('');
  const [typeNames, setTypeNames] = useState('');
  const [rawQuery, setRawQuery] = useState('');
  const [rawVars, setRawVars] = useState('');
  const show = (x) => setOut(JSON.stringify(x, null, 2));
  const run = (fn) => async () => {
    setOut('Running…');
    try { show(await fn()); } catch (e) { show({ thrown: String(e) }); }
  };

  const graphProbe = async () => {
    const id = accountId || (await view.getContext()).accountId;
    const userId = `ari:cloud:identity::user/${id}`;
    const results = { userId };
    for (const [name, q] of Object.entries(QUERIES)) results[name] = summarize(await requestTeamworkGraph(q, varsFor(name, userId)));
    return results;
  };

  return (
    <Stack space="space.200">
      <Heading size="medium">Baton week-1 spikes</Heading>
      <Text>1. Teamwork Graph. Leave blank for yourself, or paste Meera's account ID.</Text>
      <Textfield placeholder="accountId (optional)" onChange={(e) => setAccountId(e.target.value)} />
      <Button onClick={run(graphProbe)}>Probe Teamwork Graph</Button>
      <Text>2. Groq from a resolver</Text>
      <Button onClick={run(() => invoke('groqPing'))}>Ping Groq</Button>
      <Text>4. Confluence publish from Jira</Text>
      <Textfield placeholder="Confluence space key" onChange={(e) => setSpaceKey(e.target.value)} />
      <Button onClick={run(() => invoke('publishPage', { spaceKey }))}>Publish test page</Button>
      <Text>5. Inspect graph types (comma-separated, e.g. Query, JiraWorkItem, ConfluencePage). Use the __typename values from the probe.</Text>
      <Textfield placeholder="Query, JiraWorkItem, ConfluencePage" onChange={(e) => setTypeNames(e.target.value)} />
      <Button onClick={run(() => inspectTypes((typeNames || 'Query,JiraWorkItem,ConfluencePage').split(',').map((x) => x.trim()).filter(Boolean)))}>
        Inspect types
      </Button>
      <Text>6. Run a raw graph query and copy the JSON into app/test/fixtures/. $userId defaults to you (or the account ID above).</Text>
      <TextArea placeholder="query baton_fixture($userId: ID!) { ... }" onChange={(e) => setRawQuery(e.target.value)} />
      <Textfield placeholder='Extra variables as JSON, e.g. {"teamId": "ari:..."}' onChange={(e) => setRawVars(e.target.value)} />
      <Button
        onClick={run(async () => {
          const id = accountId || (await view.getContext()).accountId;
          const vars = { userId: `ari:cloud:identity::user/${id}`, ...(rawVars ? JSON.parse(rawVars) : {}) };
          return requestTeamworkGraph(rawQuery, vars);
        })}
      >
        Run raw query
      </Button>
      {out && <CodeBlock language="json" text={out} />}
    </Stack>
  );
};

ForgeReconciler.render(<App />);
