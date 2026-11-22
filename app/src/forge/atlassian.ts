// Confluence and Jira calls for publish and reassign. Always as the user: as the app, Confluence
// shows no spaces, and reassignments should be attributed to the manager who approved them.
import api, { route } from '@forge/api';
import { issueDetails as parseIssueDetails, sprintFieldId, type IssueDetails } from '../enrich/jira';
import { BatonError, type AtlassianPort } from '../handover/service';

const errorText = async (res: { status: number; text(): Promise<string> }) => {
  const body = await res.text().catch(() => '');
  try {
    const j = JSON.parse(body);
    return [...(j.errorMessages ?? []), ...Object.values(j.errors ?? {}), j.message, j.title].filter(Boolean).join('; ') || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
};

export const forgeAtlassian: AtlassianPort = {
  async createPage(spaceKey, title, storageBody) {
    const spaces = await api.asUser().requestConfluence(route`/wiki/api/v2/spaces?keys=${spaceKey}`);
    const space = spaces.ok ? (await spaces.json()).results?.[0] : undefined;
    if (!spaces.ok) console.warn('Confluence space lookup failed', spaces.status, await errorText(spaces));
    if (!space) throw new BatonError('bad_input', `No Confluence space with key ${spaceKey} that you can add pages to`);

    const res = await api.asUser().requestConfluence(route`/wiki/api/v2/pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ spaceId: space.id, status: 'current', title, body: { representation: 'storage', value: storageBody } }),
    });
    if (!res.ok) {
      const msg = await errorText(res);
      if (res.status === 400 && /title/i.test(msg)) throw new BatonError('conflict', `A page called "${title}" already exists in ${spaceKey}`);
      if (res.status === 403) throw new BatonError('bad_input', `You can't add pages to ${spaceKey}`);
      throw new Error(`Confluence page create failed: ${msg}`);
    }
    const page = await res.json();
    return { pageId: String(page.id), url: `${page._links?.base ?? ''}${page._links?.webui ?? ''}` };
  },

  async assignIssue(issueKey, accountId) {
    const res = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}/assignee`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ accountId }),
    });
    if (!res.ok) throw new Error(await errorText(res));
  },

  async issueDetails(issueIds) {
    const fieldsRes = await api.asUser().requestJira(route`/rest/api/3/field`);
    const sprintField = fieldsRes.ok ? sprintFieldId(await fieldsRes.json()) : undefined;
    const out: Record<string, IssueDetails> = {};
    for (let i = 0; i < issueIds.length; i += 100) {
      // IDs come from issue ARIs and are all digits (see issueIdOf), so they're safe in JQL.
      const batch = issueIds.slice(i, i + 100);
      const res = await api.asUser().requestJira(route`/rest/api/3/search/jql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          jql: `id in (${batch.join(',')})`,
          fields: ['updated', ...(sprintField ? [sprintField] : [])],
          maxResults: 100,
        }),
      });
      if (!res.ok) throw new Error(`Jira search failed: ${await errorText(res)}`);
      Object.assign(out, parseIssueDetails(await res.json(), sprintField));
    }
    return out;
  },
};
