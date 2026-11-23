// Local preview with test data, outside Forge: npm run dev, then open /preview.html.
// ?screen=list|new|handover (default handover), ?theme=dark. Navigation works between screens.
import '@atlaskit/css-reset';
import { setGlobalTheme } from '@atlaskit/tokens/set-global-theme';
import { createRoot } from 'react-dom/client';
import type { Api, HandoverRow } from './api';
import { App } from './App';
import { handover } from './fixtures';
import type { Platform } from './platform';
import type { Route } from './route';

const params = new URLSearchParams(location.search);
const h = handover();
const PEOPLE = [
  { accountId: 'arjun', name: 'Arjun Rao' },
  { accountId: 'lin', name: 'Lin Chen' },
  { accountId: 'meera', name: 'Meera Iyer' },
  { accountId: 'priya', name: 'Priya Nair' },
];
const row: HandoverRow = {
  id: h.id, subjectAccountId: h.subjectAccountId, subjectName: h.subjectName, reason: h.reason, lastDay: h.lastDay,
  status: h.status, role: 'editor', itemCount: h.items.length, highCount: 1, questionCount: 1, answeredCount: 0, updatedAt: h.updatedAt,
};

const api = {
  listHandovers: async () => [row],
  getHandover: async () => ({ role: 'editor', handover: h }),
  createHandover: async () => h,
  setOwner: async () => h,
  saveInventory: async () => h,
} as unknown as Api;

const root = createRoot(document.getElementById('root')!);
const show = (route: Route) => root.render(<App route={route} platform={platform} />);
const platform: Platform = {
  api,
  invokeRaw: async () => ({}),
  searchPeople: async (q) => PEOPLE.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())),
  graph: async () => ({}),
  navigate: show,
  openUrl: () => {},
  now: () => new Date('2026-11-23T00:00:00Z'),
};

const screen = params.get('screen');
void setGlobalTheme({ colorMode: params.get('theme') === 'dark' ? 'dark' : 'light' }).then(() =>
  show(screen === 'list' ? { name: 'list' } : screen === 'new' ? { name: 'new' } : { name: 'handover', id: h.id }),
);
