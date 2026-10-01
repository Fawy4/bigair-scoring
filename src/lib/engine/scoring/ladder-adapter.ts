import type { HeatResultInput, RankedEntry } from "@/lib/engine/ladder/types";
import type { ScoringModel } from "@/lib/schemas/scoring-model";
import type { HeatResult, RiderResult } from "./types";

/**
 * The raw values a rider is compared on when two riders have the same total, in the order the model's tie-breakers look at them
 * (higher is better): the best counted trick, then the other counted tricks and the best uncounted landed ones, then the Impression score.
 * The ladder uses them to split riders of different heats that tie across a pool (docs/04 decision 7).
 */
export function tieKeysFor(model: ScoringModel, r: RiderResult): number[] {
  const keys: number[] = [];
  for (const tb of model.tieBreakers) {
    if (tb === "highest_counted_trick") keys.push(r.counted[0]?.score ?? 0);
    else if (tb === "next_counted_trick") {
      const uncounted = r.allAttempts
        .filter((a) => a.status === "landed" && !a.counted && a.score !== null && a.ignored === "not_selected")
        .map((a) => a.score as number)
        .sort((x, y) => y - x);
      keys.push(...r.counted.slice(1).map((c) => c.score), ...uncounted);
    } else if (tb === "impression") keys.push(r.components.impression);
    else if (tb === "most_landed") keys.push(r.landedCount);
    else if (tb === "highest_any_trick") {
      keys.push(Math.max(0, ...r.allAttempts.filter((a) => a.status === "landed" && a.ignored !== "over_cap" && a.score !== null).map((a) => a.score as number)));
    }
  }
  return keys;
}

/** What the scoring engine hands the ladder when a heat is published: place, total, modifier and tie keys for every rider, in finishing order. */
export function toLadderResult(model: ScoringModel, result: HeatResult): HeatResultInput {
  const byId = new Map(result.riders.map((r) => [r.riderId, r]));
  const ranked: RankedEntry[] = result.ranking.map((x) => {
    const r = byId.get(x.riderId)!;
    if (x.status === "DNS" || x.status === "DSQ") return { entrantId: x.riderId, place: x.place, total: null, modifier: x.status };
    return {
      entrantId: x.riderId,
      place: x.place,
      total: x.total,
      ...(x.status === "DNF" ? { modifier: "DNF" as const } : {}),
      tieKeys: tieKeysFor(model, r),
    };
  });
  return { ranked };
}
