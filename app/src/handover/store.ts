import type { Handover } from '../types';

/** Persistence for handovers. Forge KVS in production (src/forge/kvsStore.ts), memory in tests. */
export interface Store {
  get(id: string): Promise<Handover | undefined>;
  /** Saves the handover and keeps the who-can-see-it index in step (initiator, recipients, subject). */
  put(h: Handover): Promise<void>;
  /** Handovers where the account is the initiator, a recipient or the subject. */
  listForAccount(accountId: string): Promise<Handover[]>;
  /** Every handover on the site, for Jira admins. */
  listAll(): Promise<Handover[]>;
  /** Removes the handover and its who-can-see-it rows. */
  delete(id: string): Promise<void>;
  /** Adds one to a counter and returns the new value. Need not be atomic. */
  increment(key: string): Promise<number>;
}

export const membersOf = (h: Handover) =>
  [...new Set([h.initiatorAccountId, h.subjectAccountId, ...h.recipientAccountIds])];
