// Calls to Jira that identify the caller and build links. Everything runs as the user.
import api, { getAppContext, route } from '@forge/api';
import type { Caller } from '../types';

const jsonOrNull = async (res: { ok: boolean; json(): Promise<any> }) => (res.ok ? res.json() : null);

export const isJiraAdmin = async (): Promise<boolean> => {
  const res = await api.asUser().requestJira(route`/rest/api/3/mypermissions?permissions=ADMINISTER`);
  return !!(await jsonOrNull(res))?.permissions?.ADMINISTER?.havePermission;
};

/** Resolvers: the account ID comes from the invocation context. */
export const callerFromContext = async (context: { accountId?: string }): Promise<Caller | null> => {
  if (!context?.accountId) return null;
  return { accountId: context.accountId, isAdmin: await isJiraAdmin() };
};

/**
 * Actions: Rovo puts the account ID in payload.context, MCP calls don't (see SETUP-KESHAV.md), so
 * ask Jira who the user is. Falls back to the payload only if /myself is unavailable.
 */
export const callerFromAction = async (payload: any): Promise<Caller | null> => {
  let accountId: string | undefined;
  try {
    accountId = (await jsonOrNull(await api.asUser().requestJira(route`/rest/api/3/myself`)))?.accountId;
  } catch (e) {
    console.warn('myself lookup failed', e instanceof Error ? e.message : e);
  }
  const source = accountId ? 'myself' : payload?.context?.accountId ? 'payload' : 'none';
  accountId ??= payload?.context?.accountId;
  console.log('action caller resolved via', source); // no IDs: shows whether MCP calls can identify the user
  if (!accountId) return null;
  return { accountId, isAdmin: await isJiraAdmin().catch(() => false) };
};

let baseUrl: string | undefined;

/** https://<site>/jira/apps/<appId>/<envId>/handover/<id>. The UI routes on the path suffix. */
export const handoverLink = async (id: string) => {
  if (!baseUrl) {
    const info = await jsonOrNull(await api.asUser().requestJira(route`/rest/api/3/serverInfo`));
    baseUrl = info?.baseUrl ?? '';
  }
  const { appAri, environmentAri } = getAppContext();
  return `${baseUrl}/jira/apps/${appAri.appId}/${environmentAri.environmentId}/handover/${id}`;
};

/** Active human users matching a name, or the exact account ID. */
export const findPeople = async (query: string) => {
  if (/^[\w-]+:[\w-]+$|^[0-9a-f]{24}$/i.test(query)) {
    const u = await jsonOrNull(await api.asUser().requestJira(route`/rest/api/3/user?accountId=${query}`));
    if (u?.accountId) return [{ accountId: u.accountId as string, name: u.displayName as string }];
  }
  const users: any[] = (await jsonOrNull(await api.asUser().requestJira(route`/rest/api/3/user/search?query=${query}`))) ?? [];
  return users
    .filter((u) => u.active && u.accountType === 'atlassian')
    .map((u) => ({ accountId: u.accountId as string, name: u.displayName as string }));
};
