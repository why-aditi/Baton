import { expect, test } from 'vitest';
import { initialValues, toSubmit, validate } from './automationConfig';

test('starts empty when Automation sends nothing', () => {
  expect(initialValues(undefined)).toEqual({ person: '', reason: 'leaving', lastDay: '', recipient: '' });
});

test.each([
  ['config', { config: { person: 'p', reason: 'leave', lastDay: 'd', recipient: 'r' } }],
  ['inputs', { inputs: { person: 'p', reason: 'leave', lastDay: 'd', recipient: 'r' } }],
  ['actionConfig', { actionConfig: { person: 'p', reason: 'leave', lastDay: 'd', recipient: 'r' } }],
])('reads saved values from extension.%s', (_where, extension) => {
  expect(initialValues(extension)).toEqual({ person: 'p', reason: 'leave', lastDay: 'd', recipient: 'r' });
});

test('ignores values that are not strings', () => {
  expect(initialValues({ config: { person: 42, reason: null } })).toEqual({ person: '', reason: 'leaving', lastDay: '', recipient: '' });
});

test('person, reason and last day are required; smart values are fine', () => {
  expect(validate({ person: '', reason: 'leaving', lastDay: '', recipient: '' })).toEqual({
    person: 'Who is leaving? A name, an account ID or a smart value.',
    lastDay: 'Their last day, as YYYY-MM-DD or a smart value such as {{issue.duedate}}.',
  });
  expect(validate({ person: '{{issue.assignee.accountId}}', reason: 'leaving', lastDay: '{{issue.duedate}}', recipient: '' })).toEqual({});
  expect(validate({ person: 'Meera', reason: '', lastDay: '2026-12-30', recipient: '' })).toEqual({ reason: 'Pick a reason.' });
});

test('submits trimmed values and leaves out an empty recipient', () => {
  expect(toSubmit({ person: ' Meera ', reason: 'leaving', lastDay: '2026-12-30 ', recipient: '  ' })).toEqual({
    person: 'Meera',
    reason: 'leaving',
    lastDay: '2026-12-30',
  });
  expect(toSubmit({ person: 'a', reason: 'leave', lastDay: 'b', recipient: ' {{issue.reporter.accountId}} ' })).toMatchObject({
    recipient: '{{issue.reporter.accountId}}',
  });
});
