// Typed wrapper over the app page's resolvers. Every resolver returns { ok: true, data } or
// { ok: false, error: { code, message } }; this turns the second into a thrown ApiError.
import type { SubjectView } from '../../src/handover/access';
import type { Handover, Reason, Status } from '../../src/types';
import type { Team } from '../../src/scoring/owners';
import type { Item } from '../../src/types';

export type ErrorCode = 'not_found' | 'bad_input' | 'conflict' | 'llm_unavailable' | 'internal';

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** One row of listHandovers. */
export type HandoverRow = {
  id: string;
  subjectAccountId: string;
  subjectName: string;
  reason: Reason;
  lastDay: string;
  status: Status;
  role: 'editor' | 'subject';
  itemCount: number;
  highCount: number;
  questionCount: number;
  answeredCount: number;
  updatedAt: string;
};

export type HandoverView = { role: 'editor'; handover: Handover } | SubjectView;

export type InventoryInput = {
  id: string;
  items: Item[];
  teams?: Team[];
  openAssigned?: Record<string, number>;
  people?: Record<string, string>;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } };

export type Invoke = (name: string, payload: Record<string, unknown>) => Promise<unknown>;

export const makeApi = (invoke: Invoke) => {
  const call = async <T>(name: string, payload: Record<string, unknown> = {}): Promise<T> => {
    const r = (await invoke(name, payload)) as Result<T> | undefined;
    if (!r || typeof r !== 'object' || !('ok' in r)) throw new ApiError('internal', 'Baton didn’t answer. Try again.');
    if (!r.ok) throw new ApiError(r.error.code, r.error.message);
    return r.data;
  };
  return {
    listHandovers: () => call<HandoverRow[]>('listHandovers'),
    getHandover: (id: string) => call<HandoverView>('getHandover', { id }),
    saveInventory: (input: InventoryInput) => call<Handover>('saveInventory', input),
    setOwner: (id: string, itemAri: string, accountId: string | null) =>
      call<Handover>('setOwner', { id, itemAri, accountId }),
  };
};

export type Api = ReturnType<typeof makeApi>;
