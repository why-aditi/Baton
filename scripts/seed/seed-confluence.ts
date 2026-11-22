import { confluenceApi, seedConfluence } from './confluence';
import { runScript } from './lib/main';
import { PAGES, USERS, type UserKey } from './story';

void runScript('seed-confluence', async ({ config, fetch, log }) => {
  const names = Object.fromEntries(Object.entries(USERS).map(([k, u]) => [k, u.name])) as Record<UserKey, string>;
  const r = await seedConfluence(confluenceApi(config, fetch), PAGES, { spaceKey: config.spaceKey, names, log });
  log(`Confluence: ${r.created} created, ${r.unchanged} already there`);
});
