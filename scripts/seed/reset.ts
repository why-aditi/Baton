// Puts the demo site back to the seed state so the demo can run again:
//   1. Jira: every seeded issue back to its story assignee and status (undoes Baton's reassigns).
//   2. Confluence: deletes the handover pages Baton published in the seed space.
//   3. Baton's own handovers live in Forge storage, which only the app can reach: run the
//      deleteAllHandovers resolver (instructions printed at the end).
import { confluenceApi } from './confluence';
import { jiraApi, seedJira } from './jira';
import { isMain, runScript } from './lib/main';
import { ISSUES } from './story';

/** Start of the title the app gives published pages (app/src/publish/page.ts). */
export const PUBLISHED_PREFIX = 'Handover: ';

export const removePublishedPages = async (
  api: {
    spaceId(key: string): Promise<string | undefined>;
    pagesWithPrefix(spaceId: string, prefix: string): Promise<{ id: string; title: string }[]>;
    deletePage(id: string): Promise<void>;
  },
  spaceKey: string,
  log: (line: string) => void,
) => {
  const spaceId = await api.spaceId(spaceKey);
  if (!spaceId) return 0;
  const pages = await api.pagesWithPrefix(spaceId, PUBLISHED_PREFIX);
  for (const p of pages) {
    await api.deletePage(p.id);
    log(`  deleted "${p.title}"`);
  }
  return pages.length;
};

if (isMain(import.meta.url)) {
  void runScript('reset', async ({ config, fetch, log }) => {
    log('Jira: putting back assignees and statuses');
    const j = await seedJira(jiraApi(config, fetch), ISSUES, { lastDay: config.lastDay, issueType: config.issueType, log });
    log(`  ${j.fixed} put back, ${j.unchanged} already right, ${j.created} recreated`);

    log(`Confluence: deleting published handover pages in ${config.spaceKey}`);
    const n = await removePublishedPages(confluenceApi(config, fetch), config.spaceKey, log);
    log(`  ${n} deleted (pages published to other spaces are left alone)`);

    log('\nLast step, in Baton: as a Jira admin, open Jira → Apps → Baton and run the');
    log('deleteAllHandovers resolver with payload {"confirm":"DELETE"} to remove every handover.');
  });
}
