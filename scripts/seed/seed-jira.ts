import { jiraApi, seedJira } from './jira';
import { runScript } from './lib/main';
import { ISSUES } from './story';

void runScript('seed-jira', async ({ config, fetch, log }) => {
  const r = await seedJira(jiraApi(config, fetch), ISSUES, { lastDay: config.lastDay, issueType: config.issueType, log });
  log(`Jira: ${r.created} created, ${r.fixed} put back, ${r.unchanged} already right`);
});
