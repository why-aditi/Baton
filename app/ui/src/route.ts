// The app page's routes. Rovo links point to <site>/jira/apps/<appId>/<envId>/handover/<id>, and Forge
// hands the part after the app's base URL to the page as history's pathname.

export type Route = { name: 'list' } | { name: 'handover'; id: string } | { name: 'dev' };

export const parseRoute = (pathname: string): Route => {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'handover' && parts[1]) return { name: 'handover', id: decodeURIComponent(parts[1]) };
  if (parts[0] === 'dev') return { name: 'dev' };
  return { name: 'list' };
};

export const pathFor = (route: Route): string =>
  route.name === 'handover' ? `/handover/${encodeURIComponent(route.id)}` : route.name === 'dev' ? '/dev' : '/';
