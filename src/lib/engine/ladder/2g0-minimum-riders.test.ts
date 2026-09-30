// Doc 08 §2G0 — "Riders per heat (target)", "Minimum per heat" and "Maximum per heat" (docs/04 decision 23).
// Every heat holds between the minimum and the maximum (default: target − 1, never below 2, and target + 1); the number of
// heats is the one that keeps the sizes closest to the target (not above it if it can be helped, then as little below it as
// possible; fewer heats on a tie). A field smaller than the minimum is one heat with everyone; top seeds go to the smaller heats.
import { describe, expect, it } from "vitest";
import { RoundSpecSchema, FormatTemplateSchema } from "@/lib/schemas/format-template";
import { expandFormat } from "./expand";
import { loadFormat, makeEntrants, seeds } from "./fixtures";
import { effectiveMaxHeatSize, effectiveMinHeatSize, feasibleHeatCounts, heatLimits, heatSizeRule, roundLayout } from "./seeding";

const knock = (params: Record<string, unknown>) => loadFormat("heats4-top2-single-elim", (j) => Object.assign(j.generator.params, params));
const r1 = (n: number, params: Record<string, unknown>) => seeds(expandFormat(knock(params), makeEntrants(n)), "R1");
const layout = (n: number, heatSize: number, minHeatSize?: number, maxHeatSize?: number) =>
  roundLayout(n, RoundSpecSchema.parse({ id: "R1", name: "R1", shortName: "R1", heatSize, minHeatSize, maxHeatSize, uneven: "minimum_riders" })).capacities;

describe("2G0 the owner's examples (target / minimum / maximum)", () => {
  it("14 riders, 3 / 3 / 4 → 3/3/4/4 = [1,8,9] [2,7,10] [3,6,11,14] [4,5,12,13]", () => {
    expect(r1(14, { heatSize: 3, minHeatSize: 3, maxHeatSize: 4, advancePerHeat: 1 })).toEqual([[1, 8, 9], [2, 7, 10], [3, 6, 11, 14], [4, 5, 12, 13]]);
    expect(layout(14, 3, 3, 4)).toEqual([3, 3, 4, 4]);
  });
  it("14 riders, 3 / 2 / 3 → 2/3/3/3/3", () => {
    expect(layout(14, 3, 2, 3)).toEqual([2, 3, 3, 3, 3]);
  });
  it("14 riders, 4 / 3 / 4 → 3/3/4/4", () => {
    expect(layout(14, 4, 3, 4)).toEqual([3, 3, 4, 4]);
  });
  it("13 riders, 4 / 4 / 5 → 4/4/5", () => {
    expect(layout(13, 4, 4, 5)).toEqual([4, 4, 5]);
  });
  it("24 riders, 4 / 4 / 4 → 6 × 4", () => {
    expect(layout(24, 4, 4, 4)).toEqual([4, 4, 4, 4, 4, 4]);
  });
  it("9 riders, 3 / 3 / 3 → 3 × 3", () => {
    expect(layout(9, 3, 3, 3)).toEqual([3, 3, 3]);
  });
  it("5 riders, 4 / 4 / 5 → one heat of 5", () => {
    expect(layout(5, 4, 4, 5)).toEqual([5]);
  });
  it("7 riders, 3 / 3 / 4 → 3/4", () => {
    expect(layout(7, 3, 3, 4)).toEqual([3, 4]);
  });
  it("the earlier examples still hold with the default maximum (target + 1)", () => {
    expect(layout(14, 4, 3)).toEqual([3, 3, 4, 4]);
    expect(layout(14, 3, 3)).toEqual([3, 3, 4, 4]);
    expect(layout(13, 4, 3)).toEqual([3, 3, 3, 4]);
    expect(layout(13, 4, 4)).toEqual([4, 4, 5]);
    expect(layout(5, 4, 4)).toEqual([5]);
    expect(layout(24, 4, 4)).toEqual([4, 4, 4, 4, 4, 4]);
  });
});

describe("2G0 the rule", () => {
  it("the default maximum is the target plus 1 (never above 10); the organiser may set minimum = maximum = target", () => {
    expect(effectiveMaxHeatSize(3)).toBe(4);
    expect(effectiveMaxHeatSize(10)).toBe(10);
    expect(effectiveMaxHeatSize(4, 4)).toBe(4);
    expect(effectiveMaxHeatSize(4, 2)).toBe(4); // never below the target
    expect(effectiveMaxHeatSize(4, 7)).toBe(7);
  });

  it("the default minimum is the target minus 1, never below 2", () => {
    expect(effectiveMinHeatSize(4)).toBe(3);
    expect(effectiveMinHeatSize(3)).toBe(2);
    expect(effectiveMinHeatSize(2)).toBe(2);
    expect(effectiveMinHeatSize(6)).toBe(5);
    expect(effectiveMinHeatSize(4, 4)).toBe(4); // the organiser can set it equal to the target
    expect(effectiveMinHeatSize(1)).toBe(1); // a heat of one: nothing smaller is possible
  });

  it("a field smaller than the minimum is one heat with everyone", () => {
    expect(layout(3, 4, 4)).toEqual([3]);
    expect(layout(1, 3, 3)).toEqual([1]);
  });

  it("when the minimum cannot be met at all, everyone rides one heat (the minimum is never broken)", () => {
    expect(layout(7, 4, 4)).toEqual([7]); // 3/4 would break the minimum of 4
  });

  it("top seeds are in the smaller heats", () => {
    expect(layout(14, 3, 3)).toEqual([3, 3, 4, 4]);
    expect(r1(13, { heatSize: 4, minHeatSize: 3 })[0]).toHaveLength(3);
    expect(r1(13, { heatSize: 4, minHeatSize: 3 }).at(-1)).toHaveLength(4);
  });

  it("no heat is ever smaller than the minimum or bigger than the maximum whenever a split within both limits exists", () => {
    for (let target = 2; target <= 8; target++) {
      for (let min = 1; min <= target; min++) {
        for (let max = target; max <= Math.min(10, target + 3); max++) {
          for (let n = min; n <= 120; n++) {
            const at = `n=${n} target=${target} min=${min} max=${max}`;
            const caps = layout(n, target, min, max);
            expect(caps.reduce((a, b) => a + b, 0), at).toBe(n);
            expect(Math.min(...caps), `smallest ${at}`).toBeGreaterThanOrEqual(min);
            expect([...caps].sort((a, b) => a - b), `smaller heats first ${at}`).toEqual(caps);
            expect(Math.max(...caps) - Math.min(...caps), `even split ${at}`).toBeLessThanOrEqual(1);
            const feasible = feasibleHeatCounts(n, heatLimits(target, min, max));
            if (feasible.length > 0) {
              expect(Math.max(...caps), `largest ${at}`).toBeLessThanOrEqual(max);
              expect(feasible, at).toContain(caps.length);
            }
          }
        }
      }
    }
  });

  it("when no split within both limits exists the minimum still wins (11 riders, 4 / 4 / 4 → 5/6)", () => {
    expect(layout(11, 4, 4, 4)).toEqual([5, 6]);
    expect(layout(7, 4, 4, 4)).toEqual([7]);
  });

  it("with sizes equally close to the target, the option with fewer heats wins", () => {
    // 10 riders, 4 / 3 / 5: 5+5 (two heats, one rider over the target each) and 3+3+4 (three heats, all below) — not equally
    // close: nobody is above the target in 3/3/4, so that wins. A true tie: 8 riders, 4 / 2 / 6 → 4/4 (nobody off target).
    expect(layout(10, 4, 3, 5)).toEqual([3, 3, 4]);
    expect(layout(8, 4, 2, 6)).toEqual([4, 4]);
    // 9 riders, 3 / 3 / 6: 3+3+3 (exactly on target) beats 4+5 or 9.
    expect(layout(9, 3, 3, 6)).toEqual([3, 3, 3]);
  });

  it("heatSizeRule: the smaller heats come first and the sizes add up", () => {
    expect(heatSizeRule(14, heatLimits(3, 3, 4))).toEqual([3, 3, 4, 4]);
    expect(heatSizeRule(0, heatLimits(3))).toEqual([]);
  });

  it("uses the target number of heats when every heat can meet the minimum", () => {
    expect(layout(20, 4, 4)).toHaveLength(5);
    expect(layout(18, 4, 3)).toHaveLength(5); // 3/3/4/4/4
    expect(layout(18, 4, 3)).toEqual([3, 3, 4, 4, 4]);
  });

  it("an explicit heat count still wins", () => {
    const spec = RoundSpecSchema.parse({ id: "R1", name: "R1", shortName: "R1", heatSize: 4, minHeatSize: 4, uneven: "minimum_riders", heatCountOverride: 2 });
    expect(roundLayout(9, spec).capacities).toEqual([4, 5]);
  });
});

describe("2G0 in generated formats", () => {
  it("every round of a knockout follows the same three numbers", () => {
    const draw = expandFormat(knock({ heatSize: 4, minHeatSize: 4, maxHeatSize: 4 }), makeEntrants(24));
    expect(draw.rounds[0].heats.map((h) => h.slots.length)).toEqual([4, 4, 4, 4, 4, 4]);
    for (const r of draw.rounds.slice(0, -1)) expect(Math.min(...r.heats.map((h) => h.slots.length)), r.id).toBeGreaterThanOrEqual(4);
  });

  it("the minimum defaults to target − 1 when the format does not name it", () => {
    const draw = expandFormat(knock({ heatSize: 4 }), makeEntrants(5));
    expect(draw.rounds.length).toBe(1); // 5 riders: one heat of 5, so a single final
    expect(draw.rounds[0].heats.map((h) => h.slots.length)).toEqual([5]);
  });

  it("the minimum cannot be more than the target and the maximum cannot be less than it", () => {
    const bad = JSON.parse(JSON.stringify(loadFormat("heats4-top2-single-elim")));
    bad.generator.params.minHeatSize = 5;
    expect(FormatTemplateSchema.safeParse(bad).success).toBe(false);
    bad.generator.params.minHeatSize = 4;
    expect(FormatTemplateSchema.safeParse(bad).success).toBe(true);
    bad.generator.params.maxHeatSize = 3;
    expect(FormatTemplateSchema.safeParse(bad).success).toBe(false);
    bad.generator.params.maxHeatSize = 4; // minimum = maximum = target
    expect(FormatTemplateSchema.safeParse(bad).success).toBe(true);
  });

  it("second-chance and pools formats take the three numbers", () => {
    const d = expandFormat(loadFormat("kota-dingle", (j) => Object.assign(j.generator.params, { r1HeatSize: 3, minHeatSize: 3 })), makeEntrants(14));
    expect(d.rounds[0].heats.map((h) => h.slots.length)).toEqual([3, 3, 4, 4]);
    const p = expandFormat(loadFormat("pools-to-final", (j) => Object.assign(j.generator.params, { heatSize: 8, minHeatSize: 8 })), makeEntrants(23));
    expect(p.rounds[0].heats.map((h) => h.slots.length)).toEqual([11, 12]); // 3 pools of 7/8/8 would break the minimum of 8
    const q = expandFormat(loadFormat("pools-to-final", (j) => Object.assign(j.generator.params, { heatSize: 8, minHeatSize: 6 })), makeEntrants(23));
    expect(q.rounds[0].heats.map((h) => h.slots.length)).toEqual([7, 8, 8]);
  });
});
