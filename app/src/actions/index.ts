// The five actions shared by the Rovo agent and the MCP server. Every handler validates its
// input, only shows handovers the caller may edit (the subject and strangers see "not found"),
// and returns compact JSON under 4 KB. Errors come back as { error } rather than thrown, so the
// agent can relay them.
import { BatonError, type HandoverService } from '../handover/service';
import type { Caller, Handover, ScoredItem, Status } from '../types';

const MAX_BYTES = 4096;
const STATUSES: Status[] = ['draft', 'collecting', 'ready', 'published'];

export type ActionDeps = {
  /** Link to a handover in the Baton app page. */
  link: (handoverId: string) => Promise<string>;
  /** Jira user search, run as the caller. */
  findPeople: (query: string) => Promise<{ accountId: string; name: string }[]>;
  /** A person's Jira profile URL. The agent links people only through these, never its own guesses. */
  profile: (accountId: string) => Promise<string>;
};

type Input = Record<string, unknown>;

/**
 * A person as a ready-made Markdown link, "[Meera Iyer](<profile URL>)". Agents copy it as is, so
 * the name shows instead of a bare URL. Brackets in the name are escaped so the link survives.
 */
export const personLink = (name: string, url: string) => `[${name.replace(/[\\[\]]/g, '\\$&')}](${url})`;
/**
 * A URL that survives as a Markdown link target. Bitbucket PR URLs carry `{uuid}` segments, and Rovo
 * left `[title](…{uuid}…)` as raw text (seen live Nov 26); percent-encoding them keeps the same page.
 */
export const mdUrl = (url?: string) => url?.replace(/[{}()<> ]/g, (c) => encodeURIComponent(c));
/** An item as a ready-made Markdown link, so agents show the PR or page title rather than its URL. */
const itemLink = (i: { title: string; url?: string }) => (i.url ? personLink(i.title, mdUrl(i.url)!) : null);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Trims the longest list until the JSON fits in maxBytes. */
export const compact = <T>(value: T, maxBytes = MAX_BYTES): T => {
  if (JSON.stringify(value).length <= maxBytes) return value;
  const out = structuredClone(value) as any;
  const arrays: unknown[][] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) {
      arrays.push(v);
      v.forEach(walk);
    } else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(out);
  if (out && typeof out === 'object' && !Array.isArray(out)) out.truncated = true;
  while (JSON.stringify(out).length > maxBytes) {
    const longest = arrays
      .filter((a) => a.length > 1)
      .sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)[0];
    if (!longest) break;
    longest.pop();
  }
  return out;
};

const guard =
  <A extends unknown[]>(fn: (...args: A) => Promise<object>) =>
  async (...args: A): Promise<object> => {
    try {
      return compact(await fn(...args));
    } catch (e) {
      if (e instanceof BatonError) return { error: e.message };
      throw e;
    }
  };

const matchesPerson = (h: Handover, query: string) => {
  const q = query.toLowerCase();
  return h.subjectAccountId === query || h.subjectName.toLowerCase().includes(q);
};

const toReason = (raw: string) => {
  const r = raw.toLowerCase();
  if (/team/.test(r)) return 'team_change';
  if (/leaving|quit|resign|depart/.test(r)) return 'leaving';
  if (/leave|vacation|sabbatical|parental|holiday/.test(r)) return 'leave';
  return raw;
};

export class Actions {
  constructor(
    private svc: HandoverService,
    private deps: ActionDeps,
  ) {}

  private name = (h: Handover, accountId?: string) => (accountId ? (h.people[accountId] ?? accountId) : null);

  private link = async (name: string | null, accountId?: string | null) =>
    accountId ? personLink(name ?? accountId, await this.deps.profile(accountId)) : null;

  private async owner(h: Handover, i: ScoredItem) {
    const accepted = i.acceptedOwnerAccountId;
    const top = i.suggestions[0];
    const accountId = accepted ?? top?.accountId;
    return {
      newOwner: this.name(h, accountId),
      newOwnerLink: await this.link(this.name(h, accountId), accountId),
      ownerStatus: accepted ? ('accepted' as const) : top ? ('suggested' as const) : ('none' as const),
      reason: accepted
        ? (i.suggestions.find((x) => x.accountId === accepted)?.reason ?? 'Chosen by the manager')
        : (top?.reason ?? null),
    };
  }

  /** The newest editable handover for a person. */
  private async handoverFor(caller: Caller, person: string) {
    const hs = (await this.svc.listEditable(caller)).filter((h) => matchesPerson(h, person));
    return hs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }

  listHandovers = guard(async (caller: Caller, input: Input) => {
    const status = str(input.status);
    if (status && !STATUSES.includes(status as Status)) {
      return { error: `status must be one of ${STATUSES.join(', ')}` };
    }
    const rows = await this.svc.list(caller, status ? { status: status as Status } : {});
    const editable = rows.filter((r) => r.role === 'editor');
    return {
      handovers: await Promise.all(
        editable.map(async (r) => ({
          person: r.subjectName,
          personLink: await this.link(r.subjectName, r.subjectAccountId),
          reason: r.reason,
          lastDay: r.lastDay,
          status: r.status,
          link: await this.deps.link(r.id),
        })),
      ),
    };
  });

  getHandover = guard(async (caller: Caller, input: Input) => {
    const person = str(input.person);
    if (!person) return { error: 'person is required (a name or account ID)' };
    const h = await this.handoverFor(caller, person);
    if (!h) return { result: `No handover found for "${person}".` };
    return {
      person: h.subjectName,
      personLink: await this.link(h.subjectName, h.subjectAccountId),
      reason: h.reason,
      lastDay: h.lastDay,
      status: h.status,
      overview: h.summary?.overview ?? null,
      itemCount: h.items.length,
      topRisks: await Promise.all(
        h.items.slice(0, 10).map(async (i) => {
          const { newOwner, newOwnerLink } = await this.owner(h, i);
          return { title: i.title, key: i.key, url: mdUrl(i.url), itemLink: itemLink(i), kind: i.kind, risk: i.risk, band: i.band, reasons: i.reasons, newOwner, newOwnerLink };
        }),
      ),
      answeredQuestions: h.questions
        .filter((q) => q.answer?.trim())
        .map((q) => ({ question: q.text, answer: q.answer!.slice(0, 300) })),
      link: await this.deps.link(h.id),
    };
  });

  findOwner = guard(async (caller: Caller, input: Input) => {
    const query = str(input.item);
    if (!query) return { error: 'item is required (an issue key, PR URL or page title)' };
    const q = query.toLowerCase();
    const tests: ((i: ScoredItem) => boolean)[] = [
      (i) => i.key?.toLowerCase() === q,
      (i) => i.url === query || mdUrl(i.url) === query,
      (i) => i.title.toLowerCase() === q,
      (i) => i.title.toLowerCase().includes(q),
    ];
    const handovers = await this.svc.listEditable(caller);
    for (const test of tests) {
      for (const h of handovers) {
        const i = h.items.find(test);
        if (i) {
          return {
            item: { title: i.title, key: i.key, url: mdUrl(i.url), itemLink: itemLink(i) },
            handoverFor: h.subjectName,
            currentOwner: h.subjectName,
            currentOwnerLink: await this.link(h.subjectName, h.subjectAccountId),
            ...(await this.owner(h, i)),
            link: await this.deps.link(h.id),
          };
        }
      }
    }
    return { result: `${query} is not in a handover.` };
  });

  listAtRiskItems = guard(async (caller: Caller, input: Input) => {
    const person = str(input.person);
    const minRisk = input.minRisk === undefined || input.minRisk === '' ? 60 : Number(input.minRisk);
    if (!Number.isFinite(minRisk)) return { error: 'minRisk must be a number from 0 to 100' };
    const hs = (await this.svc.listEditable(caller)).filter((h) => !person || matchesPerson(h, person));
    if (person && hs.length === 0) return { result: `No handover found for "${person}".` };
    const items = (
      await Promise.all(
        hs.flatMap((h) =>
          h.items
            .filter((i) => i.risk >= minRisk)
            .map(async (i) => {
              const { newOwner, newOwnerLink } = await this.owner(h, i);
              return {
                person: h.subjectName,
                personLink: await this.link(h.subjectName, h.subjectAccountId),
                title: i.title,
                key: i.key,
                url: mdUrl(i.url),
                itemLink: itemLink(i),
                risk: i.risk,
                reasons: i.reasons,
                newOwner,
                newOwnerLink,
              };
            }),
        ),
      )
    ).sort((a, b) => b.risk - a.risk);
    return { minRisk, items };
  });

  startHandover = guard(async (caller: Caller, input: Input) => {
    const person = str(input.person);
    if (!person) return { error: 'person is required' };
    const matches = await this.deps.findPeople(person);
    if (matches.length === 0) return { result: `Nobody matches "${person}".` };
    if (matches.length > 1) {
      return { result: `More than one person matches "${person}": ${matches.map((m) => m.name).join(', ')}. Which one?` };
    }
    const subject = matches[0]!;
    const h = await this.svc.create(caller, {
      subjectAccountId: subject.accountId,
      subjectName: subject.name,
      reason: toReason(str(input.reason)),
      lastDay: str(input.lastDay),
    });
    return {
      result: `Started a draft handover for ${subject.name}. Open Baton to build the inventory.`,
      personLink: await this.link(subject.name, subject.accountId),
      link: await this.deps.link(h.id),
    };
  });
}
