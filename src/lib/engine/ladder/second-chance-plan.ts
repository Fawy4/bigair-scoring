import { capacities, feasibleHeatCounts, fallbackHeatCount, heatSizeRule, sizeDeviation, type HeatLimits } from "./seeding";

/**
 * The shape of a "Knockout with a second chance" ladder, worked out from head counts alone (pure; docs/04 decision 26).
 *
 *   Round 1 (heat sizes by the sizing rule) → the winner of every heat goes to the main draw, the other riders (or the next
 *   `secondChancePlaces` places) go to the Second-chance round → its winners join the main draw → main-draw rounds → Final.
 *
 * Every round uses the same three numbers (target, minimum, maximum riders per heat). The number of heats and the number of
 * riders who advance per heat are chosen so that no heat is smaller than the minimum and nobody advances without riding.
 */
export interface PlannedRound {
  heats: number;
  /** Riders who advance from each heat (1st … `advance`th). */
  advance: number;
}

export interface SecondChancePlan {
  /** Round 1 heat sizes; a single entry means one heat with everyone, i.e. just the Final. */
  r1: number[];
  /** Riders who get a second chance (0 when Round 1 is the only round). */
  secondChancePool: number;
  secondChance: PlannedRound | null;
  /** Rounds between the Second-chance round and the Final. */
  main: PlannedRound[];
  /** Riders in the Final. */
  finalSize: number;
  /** True when some round had to break the maximum (the minimum still wins) or run as a single heat. */
  relaxed: boolean;
}

interface Cost {
  /** Rounds that could not keep every heat between the minimum and the maximum. */
  relaxed: number;
  /** Rounds before the Final that are only one heat. */
  single: number;
  /** Rounds (other than the one feeding the Final) that send more than half of their smallest heat on: the ladder would barely shrink. */
  weak: number;
  /** 1 when the Final has fewer riders than the size the ladder aims for. */
  small: number;
  /** Distance of the heats before the Final from the target size (`sizeDeviation`). */
  dev: number;
  /** How far the Final is from the size the ladder aims for. */
  finalDev: number;
  rounds: number;
}

interface Plan {
  cost: Cost;
  rounds: PlannedRound[];
  finalSize: number;
}

const zero: Cost = { relaxed: 0, single: 0, weak: 0, small: 0, dev: 0, finalDev: 0, rounds: 0 };

/** More than half of the smallest heat goes on. */
const isWeak = (caps: number[], advance: number) => advance > Math.floor(Math.min(...caps) / 2);

/** Lower is better; on a tie prefer the larger Final, then the smaller advance counts (the plain 1st-goes-on rule). */
function better(a: Plan, b: Plan): boolean {
  for (const k of ["relaxed", "single", "weak", "small", "dev", "finalDev", "rounds"] as const) if (a.cost[k] !== b.cost[k]) return a.cost[k] < b.cost[k];
  if (a.finalSize !== b.finalSize) return a.finalSize > b.finalSize;
  const ka = a.rounds.map((r) => r.advance).join(",");
  const kb = b.rounds.map((r) => r.advance).join(",");
  return ka < kb;
}

/** Heat counts a round of `n` riders may use: those that keep every heat between the minimum and maximum, else the fallback. */
function heatOptions(n: number, limits: HeatLimits): Array<{ heats: number; relaxed: boolean }> {
  const ok = feasibleHeatCounts(n, limits);
  if (ok.length > 0) return ok.map((heats) => ({ heats, relaxed: false }));
  return [{ heats: fallbackHeatCount(n, limits), relaxed: true }];
}

/** Best way to bring `riders` in the main draw down to a Final. Undefined when there is none. */
function planMain(riders: number, limits: HeatLimits, aim: number, memo: Map<number, Plan | null>): Plan | null {
  const known = memo.get(riders);
  if (known !== undefined) return known;
  let best: Plan | null = null;
  const consider = (p: Plan) => {
    if (!best || better(p, best)) best = p;
  };

  // The Final: everyone left rides one heat.
  const asFinal = heatOptions(riders, limits).find((o) => o.heats === 1);
  if (asFinal) {
    consider({ cost: { ...zero, relaxed: asFinal.relaxed ? 1 : 0, small: riders < aim ? 1 : 0, finalDev: Math.abs(riders - aim) }, rounds: [], finalSize: riders });
  }

  // Or one more round of at least two heats, then whatever plan fits the riders who go on.
  for (const opt of heatOptions(riders, limits)) {
    if (opt.heats < 2) continue;
    const caps = capacities(riders, opt.heats);
    for (let advance = 1; advance < Math.min(...caps); advance++) {
      const next = opt.heats * advance;
      if (next < 2 || next >= riders) continue;
      const rest = planMain(next, limits, aim, memo);
      if (!rest) continue;
      consider({
        cost: {
          relaxed: rest.cost.relaxed + (opt.relaxed ? 1 : 0),
          single: rest.cost.single,
          weak: rest.cost.weak + (rest.rounds.length > 0 && isWeak(caps, advance) ? 1 : 0),
          small: rest.cost.small,
          dev: rest.cost.dev + sizeDeviation(caps, limits.target),
          finalDev: rest.cost.finalDev,
          rounds: rest.cost.rounds + 1,
        },
        rounds: [{ heats: opt.heats, advance }, ...rest.rounds],
        finalSize: rest.finalSize,
      });
    }
  }
  memo.set(riders, best);
  return best;
}

export interface SecondChanceInput {
  limits: HeatLimits;
  /** The Final size the ladder aims for. */
  finalSize: number;
  /** Riders per heat, after the winner, who get a second chance; undefined = everyone who did not win. */
  secondChancePlaces?: number;
}

/** Riders sent to the Second-chance round from Round 1 heats of these sizes. */
export const secondChancePool = (r1: number[], places?: number): number => r1.reduce((s, c) => s + Math.min(c - 1, places ?? Infinity), 0);

export function planSecondChance(n: number, input: SecondChanceInput): SecondChancePlan {
  const { limits, finalSize: aim } = input;
  const r1 = heatSizeRule(n, limits);
  const alone: SecondChancePlan = { r1, secondChancePool: 0, secondChance: null, main: [], finalSize: n, relaxed: false };
  if (r1.length <= 1) return alone; // everyone fits in one heat: that heat is the Final

  const winners = r1.length;
  const pool = secondChancePool(r1, input.secondChancePlaces);
  const r1Relaxed = feasibleHeatCounts(n, limits).length === 0;
  const memo = new Map<number, Plan | null>();

  let best: (Plan & { sc: PlannedRound }) | null = null;
  for (const opt of heatOptions(pool, limits)) {
    const caps = capacities(pool, opt.heats);
    const mostAdvancing = Math.max(1, Math.min(...caps) - 1); // every heat still sends somebody out
    for (let advance = 1; advance <= mostAdvancing; advance++) {
      const entering = winners + opt.heats * advance;
      const rest = planMain(entering, limits, aim, memo);
      if (!rest) continue;
      const plan: Plan & { sc: PlannedRound } = {
        cost: {
          relaxed: rest.cost.relaxed + (opt.relaxed ? 1 : 0),
          single: rest.cost.single + (opt.heats < 2 ? 1 : 0),
          weak: rest.cost.weak + (rest.rounds.length > 0 && isWeak(caps, advance) ? 1 : 0),
          small: rest.cost.small,
          dev: rest.cost.dev + sizeDeviation(caps, limits.target),
          finalDev: rest.cost.finalDev,
          rounds: rest.cost.rounds + 1,
        },
        rounds: [{ heats: opt.heats, advance }, ...rest.rounds],
        finalSize: rest.finalSize,
        sc: { heats: opt.heats, advance },
      };
      if (!best || better(plan, best)) best = plan;
    }
  }
  if (!best) {
    // No way to reach a Final of the right size: everybody's second chance leads straight to one big final.
    return { r1, secondChancePool: pool, secondChance: { heats: 1, advance: 1 }, main: [], finalSize: winners + 1, relaxed: true };
  }
  return {
    r1,
    secondChancePool: pool,
    secondChance: best.sc,
    main: best.rounds.slice(1),
    finalSize: best.finalSize,
    relaxed: r1Relaxed || best.cost.relaxed > 0 || best.cost.single > 0,
  };
}
