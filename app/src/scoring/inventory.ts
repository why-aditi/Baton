import type { Item, ScoredItem } from '../types';
import { rankOwners, type OwnerContext } from './owners';
import { scoreRisk, type RiskContext } from './risk';

export type InventoryContext = RiskContext & Omit<OwnerContext, 'items'>;

/** Scores and ranks owners for a whole inventory. Returns items sorted by risk, highest first. */
export const scoreInventory = (raw: Item[], ctx: InventoryContext): ScoredItem[] => {
  // The graph returns some items twice (e.g. a page the person both owns and created).
  const byAri = new Map<string, Item>();
  for (const i of raw) if (!byAri.has(i.ari)) byAri.set(i.ari, i);
  const items = [...byAri.values()];

  return items
    .map((item) => ({
      ...item,
      ...scoreRisk(item, ctx),
      suggestions: rankOwners(item, { ...ctx, items }),
    }))
    .sort((a, b) => b.risk - a.risk || a.title.localeCompare(b.title));
};
