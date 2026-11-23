import type { Item, OwnerSuggestion } from '../types';

export type Team = { name: string; members: string[] };

export type OwnerContext = {
  subjectAri: string;
  /** The whole inventory, used for same-project co-contribution. */
  items: Item[];
  /** Teams the subject belongs to. Empty if team lookups fail (they 403 through the browser bridge). */
  teams: Team[];
  /** Open assigned item count per candidate ARI. Missing means 0. */
  openAssigned: Record<string, number>;
};

const TOP_N = 3;
const MAX_PROJECT_ITEMS = 3; // keeps a prolific contributor from drowning out item-level signals
const MAX_LOAD = 2;

export const accountIdFromAri = (ari: string) => ari.slice(ari.lastIndexOf('/') + 1);

const linkedUsers = (item: Item) => new Set([...item.collaborators, ...(item.reviewers ?? [])]);

/**
 * score(c) = 3·coContrib(c, item) + 2·sameTeam(c) + 1·coContrib(c, sameProject) − 2·load(c)
 * Candidates are the subject's teammates plus everyone linked to the item.
 */
export const rankOwners = (item: Item, ctx: OwnerContext): OwnerSuggestion[] => {
  const onItem = linkedUsers(item);
  const sameProject = item.container
    ? ctx.items.filter((i) => i.ari !== item.ari && i.container === item.container).map(linkedUsers)
    : [];

  const candidates = new Set([...onItem, ...ctx.teams.flatMap((t) => t.members)]);
  candidates.delete(ctx.subjectAri);

  const scored = [...candidates].map((c) => {
    const parts: string[] = [];
    let score = 0;

    if (onItem.has(c)) {
      score += 3;
      parts.push('worked on this item');
    }
    const team = ctx.teams.find((t) => t.members.includes(c));
    if (team) {
      score += 2;
      parts.push(`in ${team.name}`);
    }
    const projectCount = sameProject.filter((users) => users.has(c)).length;
    if (projectCount > 0) {
      score += Math.min(projectCount, MAX_PROJECT_ITEMS);
      parts.push(`worked on ${projectCount} other item${projectCount === 1 ? '' : 's'} in ${item.container}`);
    }
    const open = ctx.openAssigned[c] ?? 0;
    score -= 2 * Math.min(open / 10, MAX_LOAD);

    let reason = parts.join(', ');
    reason = reason.charAt(0).toUpperCase() + reason.slice(1);
    if (open > 0) reason += ` (has ${open} open item${open === 1 ? '' : 's'})`;

    return { accountId: accountIdFromAri(c), score: Math.round(score * 10) / 10, reason };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.accountId.localeCompare(b.accountId))
    .slice(0, TOP_N);
};
