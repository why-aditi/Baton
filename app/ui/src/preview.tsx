// Local preview with test data, outside Forge: npm run dev, then open /preview.html.
// ?screen=list|new|handover|answer (default handover; answer is the departing person's view), ?theme=dark. Navigation works between screens.
import '@atlaskit/css-reset';
import { setGlobalTheme } from '@atlaskit/tokens/set-global-theme';
import { createRoot } from 'react-dom/client';
import type { Api, HandoverRow } from './api';
import { App } from './App';
import { handover } from './fixtures';
import type { Platform } from './platform';
import type { Route } from './route';

const params = new URLSearchParams(location.search);
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
  getHandover: async () =>
    params.get('screen') === 'answer'
      ? {
          id: h.id, role: 'subject', subjectName: h.subjectName, lastDay: h.lastDay, status: h.status,
          questions: h.questions.map((q) => ({ id: q.id, text: q.text, answer: q.answer, items: h.items.filter((i) => q.itemAris.includes(i.ari)).map((i) => ({ ari: i.ari, title: i.title, url: i.url })) })),
        }
      : { role: 'editor', handover: h },
  answerQuestion: async () => ({}),
  finishAnswers: async () => ({}),
  saveQuestions: async () => h,
  generateQuestions: async () => h,
  createHandover: async () => h,
  setOwner: async () => h,
  saveInventory: async () => h,
  updateSummary: async () => h,
  generateSummary: async () => h,
  publishHandover: async () => h,
  reassignIssues: async () => ({ results: [{ ari: h.items[0]!.ari, key: 'PAY-1', accountId: 'arjun', ok: true }] }),
} as unknown as Api;

const root = createRoot(document.getElementById('root')!);
const show = (route: Route) => root.render(<App route={route} platform={platform} />);
const platform: Platform = {
  api,
  invokeRaw: async () => ({}),
  listSpaces: async () => [{ key: 'NWP', name: 'Northwind Pay' }, { key: 'PLAT', name: 'Platform' }],
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
