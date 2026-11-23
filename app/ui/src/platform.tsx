// Everything that touches Forge's bridge, behind one context so screens can be tested without Forge.
import { createContext, useContext } from 'react';
import type { GraphRequest } from '../../src/graph/runner';
import type { Api } from './api';
import type { Route } from './route';

export type Platform = {
  api: Api;
  /** Any resolver by name, unwrapped. Only the dev page uses it. */
  invokeRaw: (name: string, payload: Record<string, unknown>) => Promise<unknown>;
  /** Teamwork Graph, as the signed-in user (through the graphQuery resolver). */
  graph: GraphRequest;
  navigate: (route: Route) => void;
  /** Opens an item's URL in a new tab, outside the app's iframe. */
  openUrl: (url: string) => void;
  now: () => Date;
};

const PlatformContext = createContext<Platform | null>(null);

export const PlatformProvider = PlatformContext.Provider;

export const usePlatform = (): Platform => {
  const p = useContext(PlatformContext);
  if (!p) throw new Error('usePlatform needs a PlatformProvider');
  return p;
};
