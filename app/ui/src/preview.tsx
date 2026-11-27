// Local preview with test data, outside Forge: npm run dev, then open /preview.html.
//
//   ?screen=list|new|inventory|build|questions|review|published|answer|issue   (default inventory)
//   ?state=ok|empty|loading|error                                              (default ok)
//   ?theme=light|dark
//
// "loading" makes the calls for that screen never finish; "error" makes them fail. Screens whose data
// loads up front (list, inventory, answer, issue) show the state straight away; the others show it after
// their main action (submit, Build inventory, Draft questions, Generate handover, Check what changed).
// Navigation between screens works.
import '@atlaskit/css-reset';
import { setGlobalTheme } from '@atlaskit/tokens/set-global-theme';
import { createRoot } from 'react-dom/client';
import type { Handover } from '../../src/types';
import { ApiError, type Api, type HandoverRow, type InventoryDiff, type IssueHandover, type SubjectView } from './api';
import { App } from './App';
import { handover } from './fixtures';
import type { Platform } from './platform';
import type { Route } from './route';

const params = new URLSearchParams(location.search);
const screen = params.get('screen') ?? 'inventory';
const state = (params.get('state') ?? 'ok') as 'ok' | 'empty' | 'loading' | 'error';

const never = <T,>() => new Promise<T>(() => {});
const fail = <T,>(code: 'internal' | 'llm_unavailable' = 'internal'): Promise<T> =>
  Promise.reject(
    new ApiError(code, code === 'llm_unavailable' ? 'The language model didn’t answer. Try again in a minute.' : 'Storage is unavailable right now.'),
  );
/** The call behind this screen's state: data, never finishes, or fails. */
const by = <T,>(ok: T, empty: T = ok, code?: 'internal' | 'llm_unavailable'): Promise<T> =>
  state === 'loading' ? never<T>() : state === 'error' ? fail<T>(code) : Promise.resolve(state === 'empty' ? empty : ok);

// ---- data ----
const full = (): Handover => {
  const h = handover({ status: 'collecting' });
  h.questions.push({ id: 'q2', text: 'What’s left on the dead-letter replay tool?', itemAris: [], answer: 'Single-job replay works. Batch replay needs a rate limit.' });
  h.items[0]!.acceptedOwnerAccountId = 'arjun';
  h.summary = {
    overview: 'Meera owned the payment-retry service end to end. Arjun takes the retry logic and its open pull request; Dana takes the runbook.',
    risks: ['The backoff skips hard declines on purpose; the list is in decline_codes.yaml', 'The runbook has no other editor'],
    sections: [
      { ownerAccountId: 'arjun', body: 'PAY-1 is mid-flight and due Dec 23. Start from Meera’s notes on the decline codes.', itemAris: [h.items[0]!.ari] },
      { ownerAccountId: null, body: 'The runbook still needs an owner.', itemAris: [h.items[1]!.ari] },
    ],
  };
  return h;
};

const h = full();
const emptyH: Handover = {
  ...full(),
  ...(screen === 'build' ? { status: 'draft' as const, items: [], questions: [] } : {}),
  ...(screen === 'inventory' ? { items: [] } : {}),
  ...(screen === 'questions' || screen === 'answer' ? { questions: [] } : {}),
  ...(screen === 'review' ? { summary: undefined } : {}),
};
const published: Handover = { ...full(), status: 'published', confluencePageUrl: 'https://northwind.atlassian.net/wiki/spaces/NWP/pages/1' };

// The handover the screen opens with. Screens that show their state after an action open on data.
const base: Handover =
  screen === 'published'
    ? published
    : screen === 'build'
      ? { ...h, status: 'draft', items: [], questions: [] }
      : (screen === 'questions' || screen === 'review') && state !== 'ok'
        ? emptyH
        : state === 'empty'
          ? emptyH
          : h;

const subjectView = (x: Handover): SubjectView => ({
  id: x.id,
  role: 'subject',
  subjectName: x.subjectName,
  lastDay: x.lastDay,
  status: x.status,
  questions: x.questions.map((q) => ({
    id: q.id,
    text: q.text,
    answer: q.answer,
    items: x.items.filter((i) => q.itemAris.includes(i.ari)).map((i) => ({ ari: i.ari, title: i.title, url: i.url })),
  })),
});

const row: HandoverRow = {
  id: h.id, subjectAccountId: h.subjectAccountId, subjectName: h.subjectName, reason: h.reason, lastDay: h.lastDay,
  status: h.status, role: 'editor', itemCount: h.items.length, highCount: 1, questionCount: 2, answeredCount: 1, updatedAt: h.updatedAt,
};

const issueMatch: IssueHandover = {
  handoverId: h.id, subjectName: h.subjectName, reason: h.reason, lastDay: h.lastDay, status: h.status, risk: 75, band: 'high',
  reasons: ['Only Meera Iyer has worked on this', 'Work is mid-flight', 'Due soon after they leave'],
  newOwner: { accountId: 'arjun', name: 'Arjun Rao' }, ownerStatus: 'accepted', link: 'https://northwind.atlassian.net/jira/apps/x/y/handover/h1',
};

const diff: InventoryDiff = {
  added: [{ ari: 'ari:new', kind: 'jira_issue', key: 'PAY-35', title: 'Retry worker ignores the new partner window', url: 'https://x/PAY-35', risk: 60, band: 'high', reasons: [] }],
  gone: [{ ari: h.items[0]!.ari, kind: 'jira_issue', key: 'PAY-1', title: h.items[0]!.title, url: h.items[0]!.url, newOwner: 'Arjun Rao' }],
  stillOpen: [{ ari: h.items[1]!.ari, kind: 'confluence_page', title: h.items[1]!.title, url: h.items[1]!.url, riskBefore: 55, riskNow: 60, bandNow: 'high', reasons: [] }],
};

const PEOPLE = [
  { accountId: 'arjun', name: 'Arjun Rao' },
  { accountId: 'lin', name: 'Lin Chen' },
  { accountId: 'meera', name: 'Meera Iyer' },
  { accountId: 'priya', name: 'Priya Nair' },
];

// Calls that load the screen follow `state` on screens that load up front; action calls follow it on the others.
const loadsUpFront = ['list', 'inventory', 'answer', 'issue'].includes(screen);
const onLoad = <T,>(ok: T, empty: T = ok) => (loadsUpFront ? by(ok, empty) : Promise.resolve(ok));
const onAction = <T,>(ok: T, empty: T = ok, code?: 'internal' | 'llm_unavailable') => (loadsUpFront ? Promise.resolve(ok) : by(ok, empty, code));

const api = {
  listHandovers: () => onLoad([row], []),
  getHandover: () => onLoad(screen === 'answer' ? subjectView(base) : { role: 'editor', handover: base }),
  createHandover: () => onAction(h),
  saveInventory: () => onAction(h),
  summarizeItems: async () => h,
  setOwner: async () => h,
  generateQuestions: () => onAction(h, h, 'llm_unavailable'),
  saveQuestions: async () => h,
  answerQuestion: async () => subjectView(h),
  finishAnswers: async () => subjectView({ ...h, status: 'ready' }),
  generateSummary: () => onAction(h, h, 'llm_unavailable'),
  updateSummary: async () => h,
  publishHandover: async () => published,
  reassignIssues: async () => ({ results: [{ ari: h.items[0]!.ari, key: 'PAY-1', accountId: 'arjun', ok: true }] }),
  issueHandovers: () => onLoad([issueMatch], []),
  deleteHandover: async () => ({ deleted: h.id }),
  compareInventory: () => onAction(diff, { added: [], gone: [], stillOpen: [] }),
} as unknown as Api;

const root = createRoot(document.getElementById('root')!);
const show = (route: Route) => root.render(<App route={route} platform={platform} />);
const platform: Platform = {
  api,
  listSpaces: () =>
    screen === 'review' && state === 'error'
      ? Promise.reject(new Error('offline'))
      : screen === 'review' && state === 'loading'
        ? never()
        : Promise.resolve([{ key: 'NWP', name: 'Northwind Pay' }, { key: 'PLAT', name: 'Platform' }]),
  searchPeople: async (q) => PEOPLE.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())),
  // Graph reads behind Build inventory and What changed: finish empty, never finish, or fail.
  graph: () =>
    (screen === 'build' || screen === 'published') && state === 'loading'
      ? never()
      : (screen === 'build' || screen === 'published') && state === 'error'
        ? Promise.reject(new Error('Teamwork Graph didn’t answer'))
        : Promise.resolve({ data: null }),
  navigate: show,
  openUrl: () => {},
  now: () => new Date('2026-11-23T00:00:00Z'),
};

const first: Route =
  screen === 'list'
    ? { name: 'list' }
    : screen === 'new'
      ? { name: 'new' }
      : screen === 'issue'
        ? { name: 'issue', issueKey: 'PAY-1' }
        : { name: 'handover', id: h.id };

void setGlobalTheme({ colorMode: params.get('theme') === 'dark' ? 'dark' : 'light' }).then(() => show(first));
