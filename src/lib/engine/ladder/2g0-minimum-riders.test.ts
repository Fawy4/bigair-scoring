// Doc 08 §2G0 — "Riders per heat (target)" and "Minimum riders per heat" (docs/04 decision 23).
// Heat sizes lie between the minimum and target + 1: the target number of heats when every heat can meet the minimum,
// otherwise fewer heats (the last heats one rider bigger); a field smaller than the minimum is one heat with everyone;
// top seeds go to the smaller heats.
import { describe, expect, it } from "vitest";
import { RoundSpecSchema, FormatTemplateSchema } from "@/lib/schemas/format-template";
import { expandFormat } from "./expand";
import { loadFormat, makeEntrants, seeds } from "./fixtures";
import { effectiveMinHeatSize, roundLayout } from "./seeding";

const knock = (params: Record<string, unknown>) => loadFormat("heats4-top2-single-elim", (j) => Object.assign(j.generator.params, params));
const r1 = (n: number, params: Record<string, unknown>) => seeds(expandFormat(knock(params), makeEntrants(n)), "R1");
const layout = (n: number, heatSize: number, minHeatSize?: number) =>
  roundLayout(n, RoundSpecSchema.parse({ id: "R1", name: "R1", shortName: "R1", heatSize, minHeatSize, uneven: "minimum_riders" })).capacities;

describe("2G0 the owner's examples", () => {
  it("14 riders, target 3, minimum 3 → 3/3/4/4 = [1,8,9] [2,7,10] [3,6,11,14] [4,5,12,13]", () => {
    expect(r1(14, { heatSize: 3, minHeatSize: 3, advancePerHeat: 1 })).toEqual([[1, 8, 9], [2, 7, 10], [3, 6, 11, 14], [4, 5, 12, 13]]);
  });
  it("14 riders, target 4, minimum 3 → 3/3/4/4", () => {
    expect(layout(14, 4, 3)).toEqual([3, 3, 4, 4]);
  });
  it("13 riders, target 4, minimum 3 → 3/3/3/4", () => {
    expect(layout(13, 4, 3)).toEqual([3, 3, 3, 4]);
  });
  it("13 riders, target 4, minimum 4 → 4/4/5", () => {
    expect(layout(13, 4, 4)).toEqual([4, 4, 5]);
  });
  it("5 riders, target 4, minimum 4 → one heat of 5", () => {
    expect(layout(5, 4, 4)).toEqual([5]);
  });
  it("24 riders, target 4, minimum 4 → 6 heats of 4", () => {
    expect(layout(24, 4, 4)).toEqual([4, 4, 4, 4, 4, 4]);
  });
});

describe("2G0 the rule", () => {
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

  it("no heat is ever smaller than the minimum; none is bigger than target + 1 whenever a split within both limits exists", () => {
    for (let target = 2; target <= 8; target++) {
      for (let min = 1; min <= target; min++) {
        for (let n = min; n <= 120; n++) {
          const caps = layout(n, target, min);
          expect(caps.reduce((a, b) => a + b, 0), `n=${n} t=${target} m=${min}`).toBe(n);
          expect(Math.min(...caps), `smallest n=${n} t=${target} m=${min}`).toBeGreaterThanOrEqual(min);
          expect([...caps].sort((a, b) => a - b), "smaller heats first").toEqual(caps);
          // is there a number of heats h with every heat between min and target + 1?
          const feasible = Array.from({ length: n }, (_, i) => i + 1).some((h) => h * min <= n && n <= h * (target + 1));
          if (feasible) expect(Math.max(...caps), `largest n=${n} t=${target} m=${min}`).toBeLessThanOrEqual(target + 1);
        }
      }
    }
  });

  it("when no split within both limits exists the minimum still wins (11 riders, target 4, minimum 4 → 5/6)", () => {
    expect(layout(11, 4, 4)).toEqual([5, 6]);
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
  it("every round of a knockout follows the same two numbers", () => {
    const draw = expandFormat(knock({ heatSize: 4, minHeatSize: 4 }), makeEntrants(24));
    expect(draw.rounds[0].heats.map((h) => h.slots.length)).toEqual([4, 4, 4, 4, 4, 4]);
  });

  it("the minimum defaults to target − 1 when the format does not name it", () => {
    const draw = expandFormat(knock({ heatSize: 4 }), makeEntrants(5));
    expect(draw.rounds.length).toBe(1); // 5 riders: one heat of 5, so a single final
    expect(draw.rounds[0].heats.map((h) => h.slots.length)).toEqual([5]);
  });

  it("the minimum cannot be more than the target", () => {
    const bad = JSON.parse(JSON.stringify(loadFormat("heats4-top2-single-elim")));
    bad.generator.params.minHeatSize = 5;
    expect(FormatTemplateSchema.safeParse(bad).success).toBe(false);
    bad.generator.params.minHeatSize = 4;
    expect(FormatTemplateSchema.safeParse(bad).success).toBe(true);
  });

  it("second-chance and pools formats take the two numbers for their first round", () => {
    const d = expandFormat(loadFormat("kota-dingle", (j) => Object.assign(j.generator.params, { r1HeatSize: 3, minHeatSize: 3 })), makeEntrants(14));
    expect(d.rounds[0].heats.map((h) => h.slots.length)).toEqual([3, 3, 4, 4]);
    const p = expandFormat(loadFormat("pools-to-final", (j) => Object.assign(j.generator.params, { heatSize: 8, minHeatSize: 8 })), makeEntrants(23));
    expect(p.rounds[0].heats.map((h) => h.slots.length)).toEqual([11, 12]); // 3 pools of 7/8/8 would break the minimum of 8
    const q = expandFormat(loadFormat("pools-to-final", (j) => Object.assign(j.generator.params, { heatSize: 8, minHeatSize: 6 })), makeEntrants(23));
    expect(q.rounds[0].heats.map((h) => h.slots.length)).toEqual([7, 8, 8]);
  });
});
