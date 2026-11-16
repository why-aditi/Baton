import type { Handover } from '../types';
import { membersOf, type Store } from './store';

export class MemoryStore implements Store {
  private handovers = new Map<string, Handover>();
  private counters = new Map<string, number>();

  async get(id: string) {
    const h = this.handovers.get(id);
    return h && structuredClone(h);
  }

  async put(h: Handover) {
    this.handovers.set(h.id, structuredClone(h));
  }

  async listForAccount(accountId: string) {
    return [...this.handovers.values()].filter((h) => membersOf(h).includes(accountId)).map((h) => structuredClone(h));
  }

  async listAll() {
    return [...this.handovers.values()].map((h) => structuredClone(h));
  }

  async increment(key: string) {
    const n = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, n);
    return n;
  }
}
