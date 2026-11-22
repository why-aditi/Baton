import { bitbucketApi, seedBitbucket } from './bitbucket';
import { jiraApi } from './jira';
import { runScript } from './lib/main';
import { PULL_REQUESTS } from './story';

void runScript('seed-bitbucket', async ({ config, fetch, log }) => {
  if (!config.workspace) throw new Error('Set SEED_BITBUCKET_WORKSPACE (see scripts/README.md).');
  // Jira keys go in PR titles; run seed-jira first so the issues exist.
  const jiraKeys = Object.fromEntries((await jiraApi(config, fetch).findSeeded()).map((i) => [i.seedId, i.key]));
  const r = await seedBitbucket(bitbucketApi(config, fetch), PULL_REQUESTS, { jiraKeys, log });
  log(`Bitbucket: ${r.created} PRs opened, ${r.unchanged} already open`);
});
