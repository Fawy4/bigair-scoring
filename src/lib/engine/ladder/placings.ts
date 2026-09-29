import { eliminatedCount, outcomeOf, rankAcross, resultOf, roundComplete, seedNumber, compareScore } from "./build";
import type { DivisionDraw, Placing } from "./types";

const labelFor = (place: number, shared: boolean) => (shared ? `${place}=` : String(place));

/**
 * Final place of every rider whose placing is decided so far (docs/04 §5).
 * Riders knocked out in the same round share the place "alive + 1" ("13="), or are ranked by heat score when the
 * template says `by_heat_score`; the final heat gives places 1..k.
 */
export function divisionPlacings(draw: DivisionDraw): Placing[] {
  const total = draw.seedOrder.length;
  const out: Placing[] = [];
  let knockedOut = 0;

  for (const round of draw.rounds) {
    const count = eliminatedCount(round);
    knockedOut += count;
    const start = total - knockedOut + 1;

    if (count > 0) {
      const eliminated: Array<{ entrantId: string; seed: number; total: number | null; tieKeys: number[]; reason: string }> = [];
      const cross = round.spec.crossHeat;
      if (cross) {
        if (roundComplete(draw, round)) {
          for (const r of rankAcross(draw, round).slice(cross.advanceTop)) {
            eliminated.push({ entrantId: r.entrantId, seed: r.seed, total: r.combined, tieKeys: r.tieKeys, reason: `Ranked ${cross.combine === "sum" ? "by the sum of" : "by the best of"} their pool heats in ${round.name}` });
          }
        }
      } else {
        for (const h of round.heats) {
          for (const e of resultOf(draw, h)?.ranked ?? []) {
            if (outcomeOf(round.spec, e.place) === "eliminated") {
              eliminated.push({ entrantId: e.entrantId, seed: seedNumber(draw, e.entrantId), total: e.total, tieKeys: e.tieKeys ?? [], reason: `Finished ${e.place} in ${h.number !== null ? `Heat ${h.number}` : h.id} of ${round.name}` });
            }
          }
        }
      }
      if (draw.template.placings.eliminated === "by_heat_score") {
        eliminated.sort((a, b) => compareScore(a, b));
        eliminated.forEach((r, i) => out.push({ entrantId: r.entrantId, place: start + i, shared: false, label: String(start + i), round: round.id, reason: r.reason }));
      } else {
        for (const r of eliminated) out.push({ entrantId: r.entrantId, place: start, shared: count > 1, label: labelFor(start, count > 1), round: round.id, reason: `${r.reason}; eliminated riders share ${labelFor(start, count > 1)}` });
      }
    }

    for (const h of round.heats) {
      const res = resultOf(draw, h);
      if (!res) continue;
      for (const e of res.ranked) {
        if (outcomeOf(round.spec, e.place) !== "final_placing") continue;
        const shared = res.ranked.filter((x) => x.place === e.place).length > 1;
        out.push({ entrantId: e.entrantId, place: e.place, shared, label: labelFor(e.place, shared), round: round.id, reason: `Finished ${e.place} in the ${round.name}` });
      }
    }
  }
  return out.sort((a, b) => a.place - b.place || seedNumber(draw, a.entrantId) - seedNumber(draw, b.entrantId));
}
