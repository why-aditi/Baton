import '@atlaskit/css-reset';
import { invoke, requestConfluence, requestJira, router, view } from '@forge/bridge';
import { backendGraphRequest } from '../../src/graph/proxy';
import { setGlobalTheme } from '@atlaskit/tokens/set-global-theme';
import { createRoot } from 'react-dom/client';
import { makeApi } from './api';
import { App } from './App';
import type { Platform } from './platform';
import { parseRoute, pathFor } from './route';

const start = async () => {
  // Forge injects Atlassian's design tokens and follows the user's light or dark theme.
  // Outside Forge (vite dev), load the tokens ourselves.
  await view.theme.enable().catch(() => setGlobalTheme({ colorMode: 'auto' }));

  // The same bundle serves the app page and the Jira issue panel; the module context says which.
  const context = await view.getContext().catch(() => undefined);
  const issue = (context?.extension as { type?: string; issue?: { id?: string | number; key?: string } } | undefined)?.issue;
  const inIssuePanel = context?.moduleKey === 'baton-issue-badge' && !!issue;
  // The issue panel has no history of its own: it never navigates inside the iframe.
  const history = inIssuePanel ? undefined : await view.createHistory();

  const platform: Platform = {
    api: makeApi((name, payload) => invoke(name, payload)),
    invokeRaw: (name, payload) => invoke(name, payload),
    // Graph reads go through the graphQuery resolver: team lookups 403 through the browser bridge.
    graph: backendGraphRequest((name, payload) => invoke(name, payload)),
    searchPeople: async (query) => {
      const res = await requestJira(`/rest/api/3/user/search?maxResults=10&query=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(`User search failed: HTTP ${res.status}`);
      const users = (await res.json()) as { accountId: string; displayName: string; active: boolean; accountType: string }[];
      // Apps and customer accounts can't own work, so only active Atlassian accounts are offered.
      return users.filter((u) => u.active && u.accountType === 'atlassian').map((u) => ({ accountId: u.accountId, name: u.displayName }));
    },
    listSpaces: async () => {
      const res = await requestConfluence('/wiki/api/v2/spaces?limit=100&status=current&sort=name');
      if (!res.ok) throw new Error(`Couldn’t load Confluence spaces: HTTP ${res.status}`);
      const body = (await res.json()) as { results: { key: string; name: string; type: string }[] };
      // Team spaces first; personal spaces are rarely where a handover belongs.
      return body.results
        .sort((a, b) => Number(a.type === 'personal') - Number(b.type === 'personal'))
        .map((s) => ({ key: s.key, name: s.name }));
    },
    navigate: (route) => history?.push(pathFor(route)),
    openUrl: (url) => void router.open(url),
    now: () => new Date(),
  };

  const root = createRoot(document.getElementById('root')!);
  if (!history) {
    root.render(<App platform={platform} route={{ name: 'issue', issueId: issue?.id != null ? String(issue.id) : undefined, issueKey: issue?.key }} />);
    return;
  }
  const render = (l: { pathname: string; search: string }) => root.render(<App platform={platform} route={parseRoute(l.pathname, l.search)} />);
  render(history.location);
  history.listen((location) => render(location));
};

void start();
