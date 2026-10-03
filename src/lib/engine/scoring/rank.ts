import type { ScoringModel, TieBreaker } from "@/lib/schemas/scoring-model";
import type { RankedResult, RiderResult, TieDecision } from "./types";

const EPS = 1e-9;

/**
 * Positive when b is better (sort ascending puts the better rider first). "No value" is -Infinity (a rider with no counted trick);
 * two of them are equal. -Infinity minus -Infinity is NaN, which `!== 0` would read as "decided" (audit A1a-1), so equality is checked first.
 */
function higherFirst(a: number, b: number): number {
  if (a === b) return 0;
  const diff = b - a;
  return Math.abs(diff) < EPS ? 0 : diff;
}

function lexicographic(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const c = higherFirst(a[i] ?? -Infinity, b[i] ?? -Infinity);
    if (c !== 0) return c;
  }
  return 0;
}

/** Landed, scored attempts that did not count (excluding over-cap and interference-dropped), best first. */
function uncountedLanded(r: RiderResult): number[] {
  return r.allAttempts
    .filter((a) => a.status === "landed" && !a.counted && a.score !== null && a.ignored === "not_selected")
    .map((a) => a.score as number)
    .sort((x, y) => y - x);
}

function compareBy(tb: TieBreaker, a: RiderResult, b: RiderResult, decisions: TieDecision[]): number {
  switch (tb) {
    case "highest_counted_trick":
      return higherFirst(a.counted[0]?.score ?? -Infinity, b.counted[0]?.score ?? -Infinity);
    case "next_counted_trick":
      // Second, third… counted trick; when the counted list runs out, the next-best uncounted landed trick (decision 3).
      return lexicographic(
        [...a.counted.slice(1).map((c) => c.score), ...uncountedLanded(a)],
        [...b.counted.slice(1).map((c) => c.score), ...uncountedLanded(b)],
      );
    case "impression":
      return higherFirst(a.components.impression, b.components.impression);
    case "most_landed":
      return higherFirst(a.landedCount, b.landedCount);
    case "highest_any_trick": {
      const best = (r: RiderResult) =>
        Math.max(-Infinity, ...r.allAttempts.filter((x) => x.status === "landed" && x.ignored !== "over_cap" && x.score !== null).map((x) => x.score as number));
      return higherFirst(best(a), best(b));
    }
    case "head_judge": {
      const d = decisions.find((x) => x.riderIds.includes(a.riderId) && x.riderIds.includes(b.riderId));
      return d ? d.riderIds.indexOf(a.riderId) - d.riderIds.indexOf(b.riderId) : 0;
    }
    case "share_place":
      return 0;
  }
}

/** Walks the model's tie-breakers in order; `by` = the one that separated them, or "share_place" if reached. */
export function compareTied(
  model: ScoringModel,
  a: RiderResult,
  b: RiderResult,
  decisions: TieDecision[] = [],
): { cmp: number; by: TieBreaker | null } {
  for (const tb of model.tieBreakers) {
    if (tb === "share_place") return { cmp: 0, by: "share_place" };
    const cmp = compareBy(tb, a, b, decisions);
    if (cmp !== 0) return { cmp, by: tb };
  }
  return { cmp: 0, by: null };
}

/**
 * Orders riders (doc 03 §4.5). Equal rounded totals go through the tie-breakers; if they run out
 * without share_place or a head-judge decision, both riders get tieUnresolved (and the same place).
 * DNS riders share the place after all scored riders; DSQ riders share the place after DNS.
 */
export function rankHeat(model: ScoringModel, results: RiderResult[], decisions: TieDecision[] = []): RankedResult[] {
  const active = results.filter((r) => r.status === "ok" || r.status === "DNF");
  const sorted = [...active].sort((a, b) => b.total - a.total || compareTied(model, a, b, decisions).cmp);

  const out: RankedResult[] = sorted.map((r, i) => ({
    riderId: r.riderId,
    place: i + 1,
    total: r.total,
    totalLabel: r.totalLabel,
    status: r.status,
  }));

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].total !== sorted[i - 1].total) continue;
    const { cmp, by } = compareTied(model, sorted[i - 1], sorted[i], decisions);
    if (cmp !== 0 && by) {
      out[i - 1].tieResolvedBy ??= by;
      out[i].tieResolvedBy = by;
    } else if (by === "share_place") {
      out[i].place = out[i - 1].place;
      out[i - 1].sharedPlace = true;
      out[i].sharedPlace = true;
    } else {
      out[i].place = out[i - 1].place;
      out[i - 1].tieUnresolved = true;
      out[i].tieUnresolved = true;
    }
  }

  const tail = (status: "DNS" | "DSQ", place: number): RankedResult[] =>
    results
      .filter((r) => r.status === status)
      .map((r) => ({ riderId: r.riderId, place, total: 0, totalLabel: "—", status }));

  const dns = tail("DNS", active.length + 1);
  const dsq = tail("DSQ", active.length + dns.length + 1);
  return [...out, ...dns, ...dsq];
}
