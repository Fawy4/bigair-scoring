// Doc 08 §2G00 — qualifying_to_finals: qualifying heats rank everybody; the best go to the Final, the next best to a Small final,
// the rest are placed by their qualifying result. Every round follows the sizing rule; nobody advances without riding.
import { describe, expect, it } from "vitest";
import { expandFormat } from "./expand";
import { heat, heatSizes, loadFormat, makeEntrants, publishAll, publishRound, round, seeds } from "./fixtures";
import { minHeatsPerRider } from "./minimum";
import { divisionPlacings } from "./placings";
import { heatLimits } from "./seeding";

const qual = (params: Record<string, unknown> = {}) => loadFormat("qualifying-to-finals", (j) => Object.assign(j.generator.params, params));
const draw = (n: number, params: Record<string, unknown> = {}) => expandFormat(qual(params), makeEntrants(n));

describe("2G00 qualifying heats + finals, N = 14 (target 4, min 3, max 5; 2 qualifying heats each; Final of 4, Small final of 4)", () => {
  const d = draw(14);

  it("Q1 3/3/4/4 · Q2 3/3/4/4 · Small final 4 · Final 4 = 10 heats", () => {
    expect(d.rounds.map((r) => r.id)).toEqual(["Q1", "Q2", "SF", "F"]);
    expect(heatSizes(d, "Q1")).toEqual([3, 3, 4, 4]);
    expect(heatSizes(d, "Q2")).toEqual([3, 3, 4, 4]);
    expect(heatSizes(d, "SF")).toEqual([4]);
    expect(heatSizes(d, "F")).toEqual([4]);
    expect(d.rounds.flatMap((r) => r.heats)).toHaveLength(10);
    expect(d.rounds.map((r) => r.name)).toEqual(["Qualifying heat 1", "Qualifying heat 2", "Small final", "Final"]);
  });

  it("the best 4 go to the Final and the next 4 to the Small final, dealt after Q2 is published", () => {
    expect(seeds(d, "Q1")).toEqual([[1, 8, 9], [2, 7, 10], [3, 6, 11, 14], [4, 5, 12, 13]]);
    const x = publishRound(publishRound(d, "Q1"), "Q2");
    expect(seeds(x, "F")).toEqual([[1, 2, 3, 4]]);
    expect(seeds(x, "SF")).toEqual([[5, 6, 7, 8]]);
  });

  it("the rest are placed by their qualifying result, one place each: 1–4 Final, 5–8 Small final, 9–14 by rank", () => {
    const placings = divisionPlacings(publishAll(d));
    expect(placings.map((p) => p.place)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    expect(placings.slice(0, 8).map((p) => p.entrantId)).toEqual(["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"]);
    expect(placings.slice(8).every((p) => !p.shared)).toBe(true);
    expect(placings.slice(8).map((p) => p.entrantId)).toEqual(["r9", "r10", "r11", "r12", "r13", "r14"]);
  });

  it("every rider rides at least 2 heats", () => {
    expect(minHeatsPerRider(d)).toBe(2);
  });

  it("a Small final rider finishes after the Final's riders (place offset)", () => {
    expect(round(d, "SF").spec.placeOffset).toBe(4);
    expect(heat(d, "SF-H1").slots).toHaveLength(4);
  });
});

describe("2G00 qualifying heats + finals, other sizes", () => {
  it("one qualifying heat each: the tag is 'can be out after 1 heat'", () => {
    const d = draw(14, { qualifyingRounds: 1 });
    expect(d.rounds.map((r) => r.id)).toEqual(["Q1", "SF", "F"]);
    expect(minHeatsPerRider(d)).toBe(1);
  });

  it("no Small final when it is switched off (0) or when too few riders are left for a heat of the minimum", () => {
    expect(draw(14, { smallFinalSize: 0 }).rounds.map((r) => r.id)).toEqual(["Q1", "Q2", "F"]);
    expect(draw(6).rounds.map((r) => r.id)).toEqual(["Q1", "Q2", "F"]); // 6 − 4 = 2 left, minimum 3
    expect(draw(7).rounds.map((r) => r.id)).toEqual(["Q1", "Q2", "SF", "F"]); // 3 left = the minimum
    expect(heatSizes(draw(7), "SF")).toEqual([3]);
  });

  it("a field that fits in the Final rides one heat", () => {
    expect(draw(4).rounds.map((r) => [r.id, heatSizes(draw(4), r.id)])).toEqual([["F", [4]]]);
  });

  it("sum or best of the qualifying heats decides the ranking", () => {
    for (const combine of ["best", "sum"]) {
      const x = publishAll(draw(14, { qualifyingCombine: combine }));
      expect(divisionPlacings(x)).toHaveLength(14);
    }
  });

  it("N = 5 … 40 with several settings: no heat below the minimum or above the maximum, nobody advances without riding, every rider placed once", () => {
    for (const params of [{}, { heatSize: 3, minHeatSize: 3, maxHeatSize: 4 }, { qualifyingRounds: 1, finalSize: 6, smallFinalSize: 6, minHeatSize: 4, maxHeatSize: 6 }]) {
      const limits = heatLimits((params as { heatSize?: number }).heatSize ?? 4, (params as { minHeatSize?: number }).minHeatSize, (params as { maxHeatSize?: number }).maxHeatSize);
      for (let n = 5; n <= 40; n++) {
        const d = draw(n, params);
        const at = `${JSON.stringify(params)} N=${n}`;
        for (const r of d.rounds) for (const h of r.heats) {
          expect(h.bye, `${at} ${h.id}`).toBe(false);
          expect(h.slots.length, `${at} ${h.id} min`).toBeGreaterThanOrEqual(Math.min(limits.min, n));
          if (n >= 2 * limits.min) expect(h.slots.length, `${at} ${h.id} max`).toBeLessThanOrEqual(Math.max(limits.max, (params as { finalSize?: number }).finalSize ?? 4));
        }
        expect(d.rounds.at(-1)!.id, at).toBe("F");
        expect(new Set(divisionPlacings(publishAll(d)).map((p) => p.entrantId)).size, at).toBe(n);
      }
    }
  });

  it("rejects a minimum above the target or a maximum below it", () => {
    expect(() => qual({ minHeatSize: 5 })).toThrow();
    expect(() => qual({ maxHeatSize: 3 })).toThrow();
  });
});
