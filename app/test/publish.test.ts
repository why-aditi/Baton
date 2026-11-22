import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/handover/memoryStore';
import { BatonError, HandoverService, type AtlassianPort } from '../src/handover/service';
import type { Client } from '../src/llm/client';
import { pageBody, pageTitle } from '../src/publish/page';
import type { Caller, Handover } from '../src/types';
import { makeHandover, scored } from './helpers';

const boss: Caller = { accountId: 'boss', isAdmin: false };
const meera: Caller = { accountId: 'meera', isAdmin: false };
const llm: Client = { complete: async () => ({ text: '{}', provider: 'none' }) };

const ready = (over: Partial<Handover> = {}) =>
  makeHandover({
    status: 'ready',
    items: [
      scored('a1', { key: 'PAY-142', title: 'Retry <job>', band: 'high', risk: 80, reasons: ['Only Meera'], acceptedOwnerAccountId: 'arjun' }),
      scored('a2', { key: 'PAY-7', title: 'Old bug', acceptedOwnerAccountId: 'priya' }),
      scored('p1', { kind: 'confluence_page', title: 'Runbook', url: 'https://wiki/runbook' }),
      scored('a3', { key: 'PAY-9', title: 'No owner yet' }),
    ],
    questions: [
      { id: 'q1', text: 'Where are the staging creds?', itemAris: ['a1'], answer: 'In the vault & 1Password' },
      { id: 'q2', text: 'Unanswered?', itemAris: [] },
    ],
    summary: {
      overview: 'Meera owns payment retry.\n\nIt is fragile.',
      risks: ['Retry job has no other expert'],
      sections: [
        { ownerAccountId: 'arjun', body: 'Take the retry job.', itemAris: ['a1', 'ghost'] },
        { ownerAccountId: null, body: 'Nobody yet.', itemAris: ['p1'] },
      ],
    },
    ...over,
  });

describe('page', () => {
  it('titles the page with the person and last day', () => {
    expect(pageTitle(ready())).toBe('Handover: Meera (last day 2026-11-26)');
  });

  it('mentions owners, links items, includes answers and escapes text', () => {
    const body = pageBody(ready());
    expect(body).toContain('<ri:user ri:account-id="arjun" />');
    expect(body).toContain('<ri:user ri:account-id="meera" />');
    expect(body).toContain('<a href="https://x/a1">PAY-142 Retry &lt;job&gt;</a>');
    expect(body).toContain('In the vault &amp; 1Password');
    expect(body).not.toContain('Unanswered?');
    expect(body).toContain('<h2>Still needs an owner</h2>');
    expect(body).toContain('<p>Meera owns payment retry.</p><p>It is fragile.</p>');
    expect(body).not.toContain('ghost');
    expect(body).toContain('<td>Unassigned</td>');
  });

  it('never links a non-web URL', () => {
    const body = pageBody(makeHandover({ items: [scored('x', { title: 'Evil', url: 'javascript:alert(1)' })] }));
    expect(body).not.toContain('javascript:');
    expect(body).toContain('<td>Evil</td>');
  });

  it('still builds a page with no summary or answers', () => {
    const body = pageBody(makeHandover());
    expect(body).toContain('Everything in this handover');
    expect(body).not.toContain('<h2>Overview</h2>');
  });
});

describe('publish and reassign', () => {
  let store: MemoryStore;
  let calls: string[];
  let port: AtlassianPort;
  let svc: HandoverService;

  beforeEach(async () => {
    store = new MemoryStore();
    calls = [];
    port = {
      async createPage(spaceKey, title) {
        calls.push(`page ${spaceKey} ${title}`);
        return { pageId: '99', url: 'https://wiki/99' };
      },
      async assignIssue(key, accountId) {
        calls.push(`assign ${key} ${accountId}`);
        if (key === 'PAY-7') throw new Error('Issue is closed');
      },
    };
    svc = new HandoverService({ store, llm, now: () => '2026-11-20T00:00:00.000Z', newId: () => 'h1', llmCallsPerHour: 20, atlassian: port });
    await store.put(ready());
  });

  it('publishes as a page and marks the handover published', async () => {
    const h = await svc.publish(boss, { id: 'h1', spaceKey: 'PAY' });
    expect(calls).toEqual(['page PAY Handover: Meera (last day 2026-11-26)']);
    expect(h).toMatchObject({ status: 'published', confluencePageId: '99', confluencePageUrl: 'https://wiki/99' });
    await expect(svc.publish(boss, { id: 'h1', spaceKey: 'PAY' })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('needs a summary, a valid space key and an editor', async () => {
    await store.put(ready({ summary: undefined }));
    await expect(svc.publish(boss, { id: 'h1', spaceKey: 'PAY' })).rejects.toMatchObject({ code: 'conflict' });
    await expect(svc.publish(boss, { id: 'h1', spaceKey: 'no spaces' })).rejects.toMatchObject({ code: 'bad_input' });
    await expect(svc.publish(meera, { id: 'h1', spaceKey: 'PAY' })).rejects.toMatchObject({ code: 'not_found' });
    expect(calls).toEqual([]);
  });

  it('reassigns each issue and reports failures without stopping', async () => {
    const r = await svc.reassign(boss, { id: 'h1', itemAris: ['a1', 'a2'] });
    expect(calls).toEqual(['assign PAY-142 arjun', 'assign PAY-7 priya']);
    expect(r.results).toEqual([
      { ari: 'a1', key: 'PAY-142', accountId: 'arjun', ok: true },
      { ari: 'a2', key: 'PAY-7', accountId: 'priya', ok: false, error: 'Issue is closed' },
    ]);
  });

  it('rejects items whose URL is not http(s)', async () => {
    const item = { ari: 'z', kind: 'jira_issue', title: 'Z', url: 'javascript:alert(1)', collaborators: [], subjectRole: 'assignee' };
    await expect(svc.saveInventory(boss, { id: 'h1', items: [item] })).rejects.toMatchObject({ code: 'bad_input' });
  });

  it('refuses pages, issues without an owner and unknown items', async () => {
    for (const ari of ['p1', 'a3', 'nope']) {
      await expect(svc.reassign(boss, { id: 'h1', itemAris: [ari] })).rejects.toBeInstanceOf(BatonError);
    }
    await expect(svc.reassign(meera, { id: 'h1', itemAris: ['a1'] })).rejects.toMatchObject({ code: 'not_found' });
    expect(calls).toEqual([]);
  });
});
