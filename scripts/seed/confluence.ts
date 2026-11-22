// Seeds Confluence: about 12 pages in the Northwind Pay space, each created by its author and then
// edited once by each of its editors, so ownership and contributors are real. Idempotent: pages
// are found again by title, and existing pages are left alone.
import type { Config } from './lib/config';
import { makeHttp, type FetchLike, type Http } from './lib/http';
import type { SeedPage, UserKey } from './story';

export interface ConfluenceApi {
  spaceId(key: string): Promise<string | undefined>;
  findPage(spaceId: string, title: string): Promise<{ id: string; version: number } | undefined>;
  createPage(as: UserKey, spaceId: string, title: string, storageBody: string): Promise<{ id: string }>;
  /** `version` is the new version number (current + 1). */
  editPage(as: UserKey, id: string, title: string, storageBody: string, version: number): Promise<void>;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The page in Confluence storage format. Links resolve by title within the space. */
export const pageStorage = (page: SeedPage, titleById: Record<string, string>, reviewedBy: string[] = []) => {
  let out = `<p>${esc(page.body)}</p>`;
  const links = page.links.map((id) => titleById[id]).filter((t): t is string => !!t);
  if (links.length) {
    out += `<p>See also: ${links.map((t) => `<ac:link><ri:page ri:content-title="${esc(t)}" /></ac:link>`).join(', ')}</p>`;
  }
  if (reviewedBy.length) out += `<p><em>Reviewed by ${reviewedBy.map(esc).join(', ')}.</em></p>`;
  return out;
};

export const seedConfluence = async (
  api: ConfluenceApi,
  pages: SeedPage[],
  opts: { spaceKey: string; names: Record<UserKey, string>; log: (line: string) => void },
) => {
  const spaceId = await api.spaceId(opts.spaceKey);
  if (!spaceId) throw new Error(`Create the Confluence space ${opts.spaceKey} first (see scripts/README.md), then run this again.`);

  const titleById = Object.fromEntries(pages.map((p) => [p.id, p.title]));
  const result = { created: 0, unchanged: 0 };

  for (const page of pages) {
    if (await api.findPage(spaceId, page.title)) {
      result.unchanged++;
      continue;
    }
    const { id } = await api.createPage(page.author, spaceId, page.title, pageStorage(page, titleById));
    const reviewed: string[] = [];
    for (const [n, editor] of page.editors.entries()) {
      reviewed.push(opts.names[editor]);
      await api.editPage(editor, id, page.title, pageStorage(page, titleById, reviewed), n + 2);
    }
    result.created++;
    opts.log(`  created "${page.title}"`);
  }
  return result;
};

// ---- Confluence Cloud REST adapter (v2) ----

export const confluenceApi = (config: Config, fetch: FetchLike) => {
  const clients = new Map<UserKey, Http>();
  const as = (user: UserKey) => {
    if (!clients.has(user)) {
      const { email, token } = config.users[user];
      clients.set(user, makeHttp({ fetch, baseUrl: `https://${config.site}`, email, token }));
    }
    return clients.get(user)!;
  };
  const admin = as('priya');
  const q = encodeURIComponent;

  const api = {
    async spaceId(key: string) {
      const r = await admin.json('GET', `/wiki/api/v2/spaces?keys=${q(key)}`);
      return r.results?.[0]?.id as string | undefined;
    },

    async findPage(spaceId: string, title: string) {
      const r = await admin.json('GET', `/wiki/api/v2/pages?space-id=${q(spaceId)}&title=${q(title)}&status=current`);
      const p = r.results?.[0];
      return p ? { id: String(p.id), version: Number(p.version?.number ?? 1) } : undefined;
    },

    async createPage(user: UserKey, spaceId: string, title: string, storageBody: string) {
      const p = await as(user).json('POST', '/wiki/api/v2/pages', {
        spaceId,
        status: 'current',
        title,
        body: { representation: 'storage', value: storageBody },
      });
      return { id: String(p.id) };
    },

    async editPage(user: UserKey, id: string, title: string, storageBody: string, version: number) {
      await as(user).json('PUT', `/wiki/api/v2/pages/${q(id)}`, {
        id,
        status: 'current',
        title,
        body: { representation: 'storage', value: storageBody },
        version: { number: version, message: 'Seed edit' },
      });
    },

    /** Current pages in the space whose title starts with `prefix` (for reset). */
    async pagesWithPrefix(spaceId: string, prefix: string) {
      const out: { id: string; title: string }[] = [];
      let path: string | undefined = `/wiki/api/v2/spaces/${q(spaceId)}/pages?status=current&limit=250`;
      while (path) {
        const r: any = await admin.json('GET', path);
        for (const p of r.results ?? []) if (String(p.title).startsWith(prefix)) out.push({ id: String(p.id), title: p.title });
        path = r._links?.next;
      }
      return out;
    },

    /** Moves a page to the trash. */
    async deletePage(id: string) {
      await admin.json('DELETE', `/wiki/api/v2/pages/${q(id)}`);
    },
  };
  return api satisfies ConfluenceApi;
};
