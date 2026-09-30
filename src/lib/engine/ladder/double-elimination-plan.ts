import { capacities, feasibleHeatCounts, fallbackHeatCount, sizeDeviation, type HeatLimits } from "./seeding";

/**
 * The shape of a double-elimination ladder, worked out from head counts alone (pure; docs/04 decision 28).
 *
 *   Main draw round t: in every heat the top `advance` stay in the Main draw, the others drop to Second-chance draw round t.
 *   Second-chance draw round t: the riders who dropped plus the survivors of the round before; the top `advance` stay, the rest are out.
 *   Both draws end in one heat whose top `perDraw` riders ride the Final (so the Final has 2 × `perDraw` riders).
 *
 * Every round uses the same three sizing numbers. The number of heats and how many advance per heat are chosen so that no heat is
 * below the minimum or above the maximum, nobody advances without riding, and no round before the last one of a draw is one heat.
 */
export interface DrawStage {
  /** Main draw round: heats and riders who stay. For the last stage `advance` is `perDraw` and `heats` is 1. */
  main: { heats: number; advance: number };
  /** Second-chance draw round of the same stage. */
  second: { heats: number; advance: number };
}

export interface DoubleEliminationPlan {
  stages: DrawStage[];
  perDraw: number;
  /** True when a round had to break the maximum (the minimum wins) or is a single heat before the last stage. */
  relaxed: boolean;
}

interface Cost {
  relaxed: number;
  single: number;
  /** How far the riders-who-stay counts are from the plain "top half" (or the organiser's number). */
  advance: number;
  dev: number;
  rounds: number;
}

interface Plan {
  cost: Cost;
  stages: DrawStage[];
}

const zero: Cost = { relaxed: 0, single: 0, advance: 0, dev: 0, rounds: 0 };

function better(a: Plan, b: Plan): boolean {
  for (const k of ["relaxed", "single", "advance", "dev", "rounds"] as const) if (a.cost[k] !== b.cost[k]) return a.cost[k] < b.cost[k];
  const key = (p: Plan) => p.stages.map((s) => `${s.main.advance}${s.second.advance}`).join(",");
  return key(a) < key(b);
}

function heatOptions(n: number, limits: HeatLimits): Array<{ heats: number; relaxed: boolean }> {
  const ok = feasibleHeatCounts(n, limits);
  if (ok.length > 0) return ok.map((heats) => ({ heats, relaxed: false }));
  return [{ heats: fallbackHeatCount(n, limits), relaxed: true }];
}

export function planDoubleElimination(n: number, input: { limits: HeatLimits; finalSize: number; advancePerHeat?: number }): DoubleEliminationPlan | null {
  const { limits } = input;
  const perDraw = Math.max(1, Math.floor(input.finalSize / 2));
  const memo = new Map<string, Plan | null>();
  const desired = (caps: number[]) => input.advancePerHeat ?? Math.max(1, Math.floor(Math.min(...caps) / 2));
  const advances = (caps: number[]): number[] => {
    if (input.advancePerHeat !== undefined) return input.advancePerHeat < Math.min(...caps) ? [input.advancePerHeat] : [];
    return Array.from({ length: Math.max(1, Math.min(...caps) - 1) }, (_, i) => i + 1);
  };

  /** m riders in the Main draw, s survivors waiting in the Second-chance draw. */
  function plan(m: number, s: number): Plan | null {
    const key = `${m}/${s}`;
    if (memo.has(key)) return memo.get(key)!;
    memo.set(key, null); // (no cycles: m only shrinks)
    let best: Plan | null = null;
    const consider = (p: Plan) => {
      if (!best || better(p, best)) best = p;
    };

    // Last stage: the Main draw is one heat (its top `perDraw` go to the Final, the rest drop) and so is the Second-chance draw.
    if (m > perDraw) {
      const main = heatOptions(m, limits).find((o) => o.heats === 1);
      const drops = s + (m - perDraw);
      const second = heatOptions(drops, limits).find((o) => o.heats === 1);
      if (main && second && drops >= perDraw) {
        consider({
          cost: { ...zero, relaxed: (main.relaxed ? 1 : 0) + (second.relaxed ? 1 : 0), dev: sizeDeviation([m], limits.target) + sizeDeviation([drops], limits.target), rounds: 1 },
          stages: [{ main: { heats: 1, advance: perDraw }, second: { heats: 1, advance: perDraw } }],
        });
      }
    }

    // Another stage: at least two Main draw heats, then a Second-chance draw round for those who dropped.
    for (const mo of heatOptions(m, limits)) {
      if (mo.heats < 2) continue;
      const mainCaps = capacities(m, mo.heats);
      for (const aM of advances(mainCaps)) {
        const next = mo.heats * aM;
        if (next >= m || next <= perDraw) continue;
        const entering = s + (m - next);
        for (const so of heatOptions(entering, limits)) {
          const secCaps = capacities(entering, so.heats);
          const secondAdvances = advances(secCaps);
          for (const aS of secondAdvances.length > 0 ? secondAdvances : [1]) {
            const rest = plan(next, so.heats * aS);
            if (!rest) continue;
            consider({
              cost: {
                relaxed: rest.cost.relaxed + (mo.relaxed ? 1 : 0) + (so.relaxed ? 1 : 0),
                single: rest.cost.single + (so.heats < 2 ? 1 : 0),
                advance: rest.cost.advance + Math.abs(aM - desired(mainCaps)) + Math.abs(aS - desired(secCaps)),
                dev: rest.cost.dev + sizeDeviation(mainCaps, limits.target) + sizeDeviation(secCaps, limits.target),
                rounds: rest.cost.rounds + 1,
              },
              stages: [{ main: { heats: mo.heats, advance: aM }, second: { heats: so.heats, advance: aS } }, ...rest.stages],
            });
          }
        }
      }
    }
    memo.set(key, best);
    return best;
  }

  if (n <= perDraw * 2) return null;
  const best = plan(n, 0);
  return best ? { stages: best.stages, perDraw, relaxed: best.cost.relaxed > 0 || best.cost.single > 0 } : null;
}
