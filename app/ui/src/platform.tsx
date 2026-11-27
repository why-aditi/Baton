// Everything that touches Forge's bridge, behind one context so screens can be tested without Forge.
import { createContext, useContext } from 'react';
import type { GraphRequest } from '../../src/graph/runner';
import type { Api } from './api';
import type { Route } from './route';

export type Platform = {
  api: Api;
  /** Teamwork Graph, as the signed-in user (through the graphQuery resolver). */
  graph: GraphRequest;
  /** Active Atlassian accounts matching a name, from Jira's user search, as the signed-in user. */
  searchPeople: (query: string) => Promise<{ accountId: string; name: string }[]>;
  /** Confluence spaces the signed-in user can see, for choosing where to publish. */
  listSpaces: () => Promise<{ key: string; name: string }[]>;
  navigate: (route: Route) => void;
  /** Opens an item's URL in a new tab, outside the app's iframe. */
  openUrl: (url: string) => void;
  now: () => Date;
  /** Saves a config form's values (Jira Automation's action settings). Only set in that context. */
  submitConfig?: (values: Record<string, string>) => Promise<void>;
};

const PlatformContext = createContext<Platform | null>(null);

export const PlatformProvider = PlatformContext.Provider;

export const usePlatform = (): Platform => {
  const p = useContext(PlatformContext);
  if (!p) throw new Error('usePlatform needs a PlatformProvider');
  return p;
};
