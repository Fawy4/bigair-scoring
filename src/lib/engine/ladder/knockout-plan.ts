import { capacities, feasibleHeatCounts, heatSizeRule, type HeatLimits } from "./seeding";

/**
 * The shape of a "Knockout" ladder, worked out from head counts alone (pure; docs/04 decision 33).
 *
 * Every round follows the three sizing numbers (target, minimum, maximum riders per heat):
 *   1. a heat is never bigger than the maximum;
 *   2. when the riders left cannot be split into heats of at least the minimum (8 winners with 3 / 3 / 3), the round is run as
 *      heats of 2 (1 v 1) instead of breaking the maximum; an odd number gives one heat of 3;
 *   3. rounds are added until one heat can hold everybody left, or the riders left are no more than the final size. The final size
 *      is a target: the final is bigger only when the round before cannot produce exactly that many riders inside the limits.
 * Nobody advances without riding: no round contains a heat of one rider, and in every heat at least one rider is out.
 */
export interface KnockoutRound {
  /** Riders per heat, smallest heats first (the top seeds ride the smaller heats). */
  heats: number[];
  /** Riders who advance from each heat (1st … `advance`th). Never more than the smallest heat minus one. */
  advance: number;
  /** True when the minimum could not be kept and the round runs as heats of 2 (some of 3). */
  oneVOne: boolean;
}

export interface KnockoutPlan {
  /** The rounds before the Final. */
  rounds: KnockoutRound[];
  /** Riders in the Final. */
  finalSize: number;
}

/** The heats of one round for `riders` riders: the sizing rule when it fits, else heats of 2. */
export function knockoutLayout(riders: number, limits: HeatLimits): { heats: number[]; oneVOne: boolean } {
  if (feasibleHeatCounts(riders, limits).length > 0) return { heats: heatSizeRule(riders, limits), oneVOne: false };
  return { heats: capacities(riders, Math.max(1, Math.floor(riders / 2))), oneVOne: true };
}

export function planKnockout(n: number, { limits, advance, finalSize }: { limits: HeatLimits; advance: number; finalSize: number }): KnockoutPlan {
  const rounds: KnockoutRound[] = [];
  let riders = n;
  while (riders > finalSize && rounds.length < 60) {
    const { heats, oneVOne } = knockoutLayout(riders, limits);
    if (heats.length === 1) break; // one heat holds everybody: it is the final
    const smallest = Math.min(...heats);
    const perHeat = Math.max(1, Math.min(advance, smallest - 1));
    rounds.push({ heats, advance: perHeat, oneVOne });
    riders = heats.length * perHeat;
  }
  return { rounds, finalSize: riders };
}
