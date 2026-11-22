import { beforeEach, describe, expect, test } from 'vitest';
import { pageStorage, seedConfluence, type ConfluenceApi } from '../seed/confluence';
import type { SeedPage, UserKey } from '../seed/story';

class FakeConfluence implements ConfluenceApi {
  spaces = new Map([['NWP', 'space-1']]);
  pages: { id: string; spaceId: string; title: string; body: string; version: number; history: UserKey[] }[] = [];
  calls: string[] = [];

  async spaceId(key: string) {
    return this.spaces.get(key);
  }
  async findPage(spaceId: string, title: string) {
    const p = this.pages.find((x) => x.spaceId === spaceId && x.title === title);
    return p && { id: p.id, version: p.version };
  }
  async createPage(as: UserKey, spaceId: string, title: string, body: string) {
    const id = `p${this.pages.length + 1}`;
    this.pages.push({ id, spaceId, title, body, version: 1, history: [as] });
    this.calls.push(`create "${title}" as ${as}`);
    return { id };
  }
  async editPage(as: UserKey, id: string, title: string, body: string, version: number) {
    const p = this.pages.find((x) => x.id === id)!;
    if (version !== p.version + 1) throw new Error(`stale version ${version}`);
    Object.assign(p, { title, body, version });
    p.history.push(as);
    this.calls.push(`edit "${title}" as ${as}`);
  }
}

const names = { meera: 'Meera Iyer', priya: 'Priya Nair', dana: 'Dana Weiss' } as Record<UserKey, string>;
const pages: SeedPage[] = [
  { id: 'runbook', title: 'Retry runbook', author: 'meera', editors: [], links: [], body: 'How to pause retries & <restart>.' },
  { id: 'home', title: 'Team home', author: 'priya', editors: ['dana', 'meera'], links: ['runbook'], body: 'Start here.' },
];

let api: FakeConfluence;
const opts = () => ({ spaceKey: 'NWP', names, log: () => {} });

beforeEach(() => {
  api = new FakeConfluence();
});

describe('seedConfluence', () => {
  test('creates each page as its author, then each editor edits it once', async () => {
    const r = await seedConfluence(api, pages, opts());
    expect(r).toEqual({ created: 2, unchanged: 0 });
    expect(api.pages.map((p) => [p.title, p.history, p.version])).toEqual([
      ['Retry runbook', ['meera'], 1],
      ['Team home', ['priya', 'dana', 'meera'], 3],
    ]);
  });

  test('a second run changes nothing', async () => {
    await seedConfluence(api, pages, opts());
    api.calls = [];
    expect(await seedConfluence(api, pages, opts())).toEqual({ created: 0, unchanged: 2 });
    expect(api.calls).toEqual([]);
  });

  test('stops with instructions when the space is missing', async () => {
    await expect(seedConfluence(api, pages, { ...opts(), spaceKey: 'NOPE' })).rejects.toThrow(/Create the Confluence space NOPE/);
  });
});

describe('pageStorage', () => {
  const titles = { runbook: 'Retry runbook' };

  test('escapes the body and links other pages by title', () => {
    expect(pageStorage(pages[1]!, titles)).toBe(
      '<p>Start here.</p><p>See also: <ac:link><ri:page ri:content-title="Retry runbook" /></ac:link></p>',
    );
    expect(pageStorage(pages[0]!, titles)).toBe('<p>How to pause retries &amp; &lt;restart&gt;.</p>');
  });

  test('an editor adds a line, so the edit is a real change', () => {
    expect(pageStorage(pages[0]!, titles, ['Dana Weiss'])).toBe(
      '<p>How to pause retries &amp; &lt;restart&gt;.</p><p><em>Reviewed by Dana Weiss.</em></p>',
    );
  });
});
