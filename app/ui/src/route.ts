// The app page's routes. Rovo links point to <site>/jira/apps/<appId>/<envId>/handover/<id>, and Forge
// hands the part after the app's base URL to the page as history's pathname.

export type Route =
  | { name: 'list' }
  | { name: 'new' }
  /** `build`: start reading the graph as soon as the screen opens (right after New handover). */
  | { name: 'handover'; id: string; build?: boolean }
  | { name: 'dev' }
  /** The Jira issue panel: chosen from the module context in main.tsx, never from a URL. */
  | { name: 'issue'; issueId?: string; issueKey?: string };

export const parseRoute = (pathname: string, search = ''): Route => {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'handover' && parts[1]) {
    const build = new URLSearchParams(search).get('build') === '1';
    return { name: 'handover', id: decodeURIComponent(parts[1]), ...(build && { build }) };
  }
  if (parts[0] === 'new') return { name: 'new' };
  if (parts[0] === 'dev') return { name: 'dev' };
  return { name: 'list' };
};

export const pathFor = (route: Route): string => {
  switch (route.name) {
    case 'handover':
      return `/handover/${encodeURIComponent(route.id)}${route.build ? '?build=1' : ''}`;
    case 'new':
      return '/new';
    case 'dev':
      return '/dev';
    default:
      return '/';
  }
};
