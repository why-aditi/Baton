import { expect, test } from 'vitest';
import { roleOf, subjectView } from '../src/handover/access';
import { makeHandover } from './helpers';

const h = makeHandover({ initiatorAccountId: 'boss', recipientAccountIds: ['rec'], subjectAccountId: 'meera' });

test.each([
  ['boss', false, 'editor'],
  ['rec', false, 'editor'],
  ['admin', true, 'editor'],
  ['meera', false, 'subject'],
  ['stranger', false, null],
])('%s (admin %s) is %s', (accountId, isAdmin, role) => {
  expect(roleOf(h, { accountId, isAdmin })).toBe(role);
});

test('an admin who is also the subject is still only the subject', () => {
  expect(roleOf(h, { accountId: 'meera', isAdmin: true })).toBe('subject');
});

test('the subject view holds only their questions and the items those link to', () => {
  const full = makeHandover({
    questions: [{ id: 'q1', text: 'Where is the runbook?', itemAris: ['i1'], answer: 'Wiki' }],
  });
  const view = subjectView(full);
  expect(view).toEqual({
    id: full.id,
    role: 'subject',
    subjectName: 'Meera',
    lastDay: full.lastDay,
    status: full.status,
    questions: [
      {
        id: 'q1',
        text: 'Where is the runbook?',
        answer: 'Wiki',
        items: [{ ari: 'i1', title: 'Payment retry runbook', url: 'https://x/i1' }],
      },
    ],
  });
  expect(JSON.stringify(view)).not.toContain('risk');
});
