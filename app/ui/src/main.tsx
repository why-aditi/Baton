import '@atlaskit/css-reset';
import { invoke, router, view } from '@forge/bridge';
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
  const history = await view.createHistory();

  const platform: Platform = {
    api: makeApi((name, payload) => invoke(name, payload)),
    invokeRaw: (name, payload) => invoke(name, payload),
    // Graph reads go through the graphQuery resolver: team lookups 403 through the browser bridge.
    graph: backendGraphRequest((name, payload) => invoke(name, payload)),
    navigate: (route) => history.push(pathFor(route)),
    openUrl: (url) => void router.open(url),
    now: () => new Date(),
  };

  const root = createRoot(document.getElementById('root')!);
  const render = (pathname: string) => root.render(<App platform={platform} route={parseRoute(pathname)} />);
  render(history.location.pathname);
  history.listen((location) => render(location.pathname));
};

void start();
