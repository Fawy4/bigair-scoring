import { outcomeOf } from "./build";
import type { DivisionDraw } from "./types";

/**
 * The fewest heats any rider is guaranteed to ride in this draw, whatever the results: the shortest way through the ladder
 * from the first round to being out or reaching the final placing. A rider who advances without riding counts no heat for
 * that round. Pure; used for "Minimum heats per rider: N" in the format preview.
 */
export function minHeatsPerRider(draw: DivisionDraw): number {
  const roundValue = new Map<string, number>();
  for (let i = draw.rounds.length - 1; i >= 0; i--) {
    const round = draw.rounds[i];
    let best = Infinity;
    for (const heat of round.heats) {
      let worst = Infinity; // the place that ends the rider's journey soonest
      for (let place = 1; place <= Math.max(1, heat.slots.length); place++) {
        const cross = round.spec.crossHeat;
        const target = cross ? "eliminated" : outcomeOf(round.spec, place);
        // a cross-heat rank is not known before the pools are done: whoever misses the cut (or the Small final) is out
        const afterwards = target === "eliminated" || target === "final_placing" ? 0 : (roundValue.get(target) ?? 0);
        worst = Math.min(worst, afterwards);
      }
      best = Math.min(best, (heat.bye ? 0 : 1) + (worst === Infinity ? 0 : worst));
    }
    roundValue.set(round.id, best === Infinity ? 0 : best);
  }
  // entry rounds: nobody else sends riders there (a round-robin round is dealt from the seeds but follows the round before it)
  const targeted = new Set(draw.rounds.flatMap((r) => [...r.spec.advance.map((a) => a.to), ...(r.spec.crossHeat ? [r.spec.crossHeat.to, ...(r.spec.crossHeat.alsoTo ? [r.spec.crossHeat.alsoTo.to] : [])] : [])]));
  const entry = draw.rounds.filter((r) => r.spec.entrantsFrom.every((s) => s.type === "seeds") && !targeted.has(r.id));
  return entry.length ? Math.min(...entry.map((r) => roundValue.get(r.id) ?? 0)) : 0;
}
