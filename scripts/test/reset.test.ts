import { expect, test } from 'vitest';
import { PUBLISHED_PREFIX, removePublishedPages } from '../seed/reset';

const fake = (titles: string[], spaceExists = true) => {
  const deleted: string[] = [];
  return {
    deleted,
    api: {
      spaceId: async () => (spaceExists ? 's1' : undefined),
      pagesWithPrefix: async (_s: string, prefix: string) =>
        titles.map((title, n) => ({ id: `p${n}`, title })).filter((p) => p.title.startsWith(prefix)),
      deletePage: async (id: string) => void deleted.push(id),
    },
  };
};

test('the prefix matches the title the app gives published pages', async () => {
  const { pageTitle } = await import('../../app/src/publish/page');
  expect(pageTitle({ subjectName: 'Meera Iyer', lastDay: '2026-12-30' } as never).startsWith(PUBLISHED_PREFIX)).toBe(true);
});

test('deletes only pages Baton published', async () => {
  const { api, deleted } = fake(['Handover: Meera Iyer (last day 2026-12-30)', 'Payment retry service runbook', 'Handover notes from 2024']);
  expect(await removePublishedPages(api, 'NWP', () => {})).toBe(1);
  expect(deleted).toEqual(['p0']);
});

test('a missing space means nothing to delete', async () => {
  const { api, deleted } = fake(['Handover: x'], false);
  expect(await removePublishedPages(api, 'NWP', () => {})).toBe(0);
  expect(deleted).toEqual([]);
});
