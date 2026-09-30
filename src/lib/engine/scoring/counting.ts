import type { ScoringModel } from "@/lib/schemas/scoring-model";
import { normaliseTrickName } from "./attempts";

export interface EligibleTrick {
  seq: number;
  /** Rounded panel score (or 0 for a crash with crash = "zero"). */
  score: number;
  categoryKey: string | null;
  trickName: string | null;
  landed: boolean;
}

/** Best first; a landed trick beats a crash on equal score; then earlier seq first. */
export function compareTricks(a: EligibleTrick, b: EligibleTrick): number {
  return b.score - a.score || Number(b.landed) - Number(a.landed) || a.seq - b.seq;
}

/** How many tricks of one category may count: the per-category dial, else maxPerCategory. */
export function categoryLimit(
  counting: { maxPerCategory: number; perCategoryMax?: Record<string, number> },
  categoryKey: string,
): number {
  return counting.perCategoryMax?.[categoryKey] ?? counting.maxPerCategory;
}

/**
 * Picks the counted tricks (doc 03 §4.3), best first. Uncategorised tricks cannot count under
 * best_per_category (they are reported by the caller).
 */
export function selectCounted(model: ScoringModel, eligible: EligibleTrick[]): EligibleTrick[] {
  const sorted = [...eligible].sort(compareTricks);
  const counting = model.heat.counting;

  switch (counting.type) {
    case "none":
      return [];
    case "all":
      return sorted;
    case "single_best":
      return sorted.slice(0, 1);
    case "best_n": {
      if (!counting.distinctTrickNames) return sorted.slice(0, counting.n);
      const seen = new Set<string>();
      const distinct = sorted.filter((t) => {
        const key = normaliseTrickName(t.trickName);
        if (key === null) return true; // unnamed tricks are never merged
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return distinct.slice(0, counting.n);
    }
    case "best_per_category": {
      const groups = new Map<string, EligibleTrick[]>();
      for (const t of sorted) {
        if (t.categoryKey === null) continue;
        const g = groups.get(t.categoryKey) ?? [];
        if (g.length < categoryLimit(counting, t.categoryKey)) g.push(t);
        groups.set(t.categoryKey, g);
      }
      const limit = counting.categoriesCounted ?? Infinity; // default: every category
      return [...groups.values()]
        .sort((a, b) => compareTricks(a[0], b[0]))
        .slice(0, limit)
        .flat()
        .sort(compareTricks);
    }
  }
}
