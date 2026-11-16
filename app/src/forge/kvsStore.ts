import { kvs, WhereConditions } from '@forge/kvs';
import { membersOf, type Store } from '../handover/store';
import type { Handover, Status } from '../types';

// Entities and indexes are declared under app.storage.entities in manifest.yml.
const handovers = () => kvs.entity<Handover>('handover');
type Member = { handoverId: string; accountId: string };
const members = () => kvs.entity<Member>('handover-member');

const STATUSES: Status[] = ['draft', 'collecting', 'ready', 'published'];

const memberKey = (handoverId: string, accountId: string) => `${handoverId}:${accountId}`;

export class KvsStore implements Store {
  async get(id: string) {
    return handovers().get(id);
  }

  async put(h: Handover) {
    const before = await handovers().get(h.id);
    await handovers().set(h.id, h);
    const now = membersOf(h);
    const gone = before ? membersOf(before).filter((a) => !now.includes(a)) : [];
    await Promise.all([
      ...now.map((accountId) => members().set(memberKey(h.id, accountId), { handoverId: h.id, accountId })),
      ...gone.map((accountId) => members().delete(memberKey(h.id, accountId))),
    ]);
  }

  async listForAccount(accountId: string) {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      let q = members().query().index('accountId').where(WhereConditions.equalTo(accountId)).limit(100);
      if (cursor) q = q.cursor(cursor);
      const page = await q.getMany();
      ids.push(...page.results.map((r) => r.value.handoverId));
      cursor = page.nextCursor;
    } while (cursor);
    const found = await Promise.all([...new Set(ids)].map((id) => this.get(id)));
    return found.filter((h): h is Handover => !!h);
  }

  async listAll() {
    const out: Handover[] = [];
    for (const status of STATUSES) {
      let cursor: string | undefined;
      do {
        let q = handovers().query().index('status').where(WhereConditions.equalTo(status)).limit(100);
        if (cursor) q = q.cursor(cursor);
        const page = await q.getMany();
        out.push(...page.results.map((r) => r.value));
        cursor = page.nextCursor;
      } while (cursor);
    }
    return out;
  }

  async increment(key: string) {
    const k = `counter:${key}`;
    const n = ((await kvs.get<number>(k)) ?? 0) + 1;
    await kvs.set(k, n, { ttl: { value: 2, unit: 'DAYS' } });
    return n;
  }
}
