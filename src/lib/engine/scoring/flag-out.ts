import type { ScoringModel } from "@/lib/schemas/scoring-model";
import { computeHeat } from "./heat";
import type { HeatInput } from "./types";

export interface FlagOutCandidates {
  /** Riders to flag out, worst first. */
  riders: string[];
  /** The riders at the cut are tied on everything the tie-breakers can see: the head judge must choose. Both are listed. */
  undecided: boolean;
}

/** Flag-out (docs/04): at the set minute the lowest `count` riders by provisional ranking leave the heat. Riders who are not riding are never offered. */
export function flagOutCandidates(model: ScoringModel, heat: HeatInput, count: number): FlagOutCandidates {
  if (count <= 0) return { riders: [], undecided: false };
  const result = computeHeat(model, heat);
  const riding = result.ranking.filter((r) => r.status === "ok" || r.status === "DNF");
  const n = Math.min(count, riding.length);
  const flagged = riding.slice(riding.length - n);
  const best = flagged[0];
  const kept = riding[riding.length - n - 1];
  const tied = (x: (typeof riding)[number]) => x.tieUnresolved === true || x.sharedPlace === true;
  const undecided = Boolean(best && kept && best.place === kept.place && tied(best) && tied(kept));
  if (!undecided) return { riders: flagged.map((r) => r.riderId).reverse(), undecided: false };
  const group = riding.filter((r) => r.place === best.place && tied(r));
  const below = flagged.filter((r) => !group.includes(r));
  return { riders: [...below, ...group].map((r) => r.riderId).reverse(), undecided: true };
}
