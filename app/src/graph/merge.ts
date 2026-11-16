import type { Item, SubjectRole } from '../types';

// When the same item comes from several queries, the strongest tie to the person wins.
const ROLE_STRENGTH: SubjectRole[] = ['assignee', 'author', 'owner', 'reviewer', 'contributor', 'reporter'];
const stronger = (a: SubjectRole, b: SubjectRole) => (ROLE_STRENGTH.indexOf(a) <= ROLE_STRENGTH.indexOf(b) ? a : b);
const union = (a?: string[], b?: string[]) => (a || b ? [...new Set([...(a ?? []), ...(b ?? [])])] : undefined);

/** Merges normalized items from every source into one list, deduplicated by ARI. */
export const mergeItems = (sources: Item[][]): Item[] => {
  const byAri = new Map<string, Item>();
  for (const item of sources.flat()) {
    const prev = byAri.get(item.ari);
    if (!prev) {
      byAri.set(item.ari, { ...item });
      continue;
    }
    const merged: Item = { ...item, ...stripUndefined(prev) };
    merged.subjectRole = stronger(prev.subjectRole, item.subjectRole);
    merged.collaborators = union(prev.collaborators, item.collaborators) ?? [];
    const reviewers = union(prev.reviewers, item.reviewers);
    if (reviewers) merged.reviewers = reviewers;
    byAri.set(item.ari, merged);
  }
  return [...byAri.values()];
};

const stripUndefined = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

export type SourceResult = {
  source: string;
  /** Plural noun for messages, e.g. "Jira work items". */
  label: string;
  count: number;
  dropped: number;
  errors: string[];
  truncated: boolean;
  /** The scope that, when missing, makes this source silently empty. */
  hint?: string;
};

export type Warning = { source: string; level: 'info' | 'warning' | 'error'; message: string };

/**
 * The startup self-check. A missing scope doesn't raise an error, it just returns nothing, so an
 * empty source is flagged with the scope to check.
 */
export const coverageWarnings = (results: SourceResult[]): Warning[] =>
  results.flatMap((r): Warning[] => {
    const w: Warning[] = [];
    if (r.errors.length > 0) {
      w.push({ source: r.source, level: 'error', message: `Could not load all ${r.label} (${r.errors.join(', ')}).` });
    } else if (r.count === 0 && r.dropped === 0) {
      const scope = r.hint ? `the ${r.hint} scope is` : "Baton's graph scopes are";
      w.push({
        source: r.source,
        level: 'info',
        message: `No ${r.label} found. If you expected some, check that ${scope} granted.`,
      });
    }
    if (r.dropped > 0) {
      w.push({
        source: r.source,
        level: 'warning',
        message: `${r.dropped} ${r.label} are hidden because you can't see them. Someone with more access should run this handover.`,
      });
    }
    if (r.truncated) {
      w.push({ source: r.source, level: 'warning', message: `Only the first ${r.count} ${r.label} were loaded.` });
    }
    return w;
  });
