// Doc 08 §2G7 — "Knockout": the target / minimum / maximum riders per heat apply to EVERY round (docs/04 decision 33).
// Never above the maximum; when the riders left cannot form heats of at least the minimum, heats of 2 (1 v 1) rather than
// breaking the maximum; rounds are added until one heat remains (its size is a target); nobody advances without riding.
import { describe, expect, it } from "vitest";
import type { FormatTemplate } from "@/lib/schemas/format-template";
import { expandFormat } from "./expand";
import { heatSizes, loadFormat, makeEntrants, publishAll, round, shape } from "./fixtures";
import { planKnockout } from "./knockout-plan";
import { divisionPlacings } from "./placings";
import { feasibleHeatCounts, heatLimits } from "./seeding";
import type { DivisionDraw } from "./types";

const knock = (params: Record<string, unknown>): FormatTemplate => loadFormat("heats4-top2-single-elim", (j) => Object.assign(j.generator.params, params));
const draw = (n: number, params: Record<string, unknown>) => expandFormat(knock(params), makeEntrants(n));
const sizes = (d: DivisionDraw) => d.rounds.map((r) => [r.id, heatSizes(d, r.id)] as const);
const heatCount = (d: DivisionDraw) => d.rounds.reduce((s, r) => s + r.heats.length, 0);

describe("2G7 the owner's example: 24 riders, target 3, minimum 3, maximum 3, 1 advances, final of 2", () => {
  const params = { heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2 };
  const d = draw(24, params);

  it("R1 8 heats of 3 → R2 4 heats of 2 → SF 2 heats of 2 → F 1 heat of 2: 15 heats", () => {
    expect(d.rounds.map((r) => [r.id, r.heats.length])).toEqual([["R1", 8], ["R2", 4], ["SF", 2], ["F", 1]]);
    expect(sizes(d)).toEqual([["R1", Array(8).fill(3)], ["R2", [2, 2, 2, 2]], ["SF", [2, 2]], ["F", [2]]]);
    expect(heatCount(d)).toBe(15);
    expect(d.rounds.map((r) => r.expectedEntrants)).toEqual([24, 8, 4, 2]);
  });

  it("no heat is above the maximum of 3, and no heat has a rider who advances without riding", () => {
    for (const r of d.rounds) for (const h of r.heats) {
      expect(h.slots.length).toBeLessThanOrEqual(3);
      expect(h.slots.length).toBeGreaterThanOrEqual(2);
      expect(h.bye).toBe(false);
    }
  });

  it("the 1 v 1 rounds carry no 'below the minimum' warning: it is the rule, not a problem", () => {
    expect(d.warnings.filter((w) => w.type === "heat_size_limits")).toEqual([]);
  });

  it("adjacent heats meet: R2 pairs the winners of H1 + H2, H3 + H4, …; the semi-finals pair R2's H1 + H2 and H3 + H4", () => {
    expect(shape(d, "R2")).toEqual([["H1p1", "H2p1"], ["H3p1", "H4p1"], ["H5p1", "H6p1"], ["H7p1", "H8p1"]]);
    expect(shape(d, "SF")).toEqual([["H1p1", "H2p1"], ["H3p1", "H4p1"]]);
    expect(shape(d, "F")).toEqual([["H1p1", "H2p1"]]);
  });

  it("with results, the riders really meet their neighbours: the winner of R1 H1 rides R2 H1 with the winner of R1 H2", () => {
    const done = publishAll(d);
    const winnerOf = (heatId: string) => done.results[heatId].ranked.find((r) => r.place === 1)!.entrantId;
    const r2 = round(done, "R2").heats;
    expect(r2[0].slots.map((s) => s.entrantId)).toEqual([winnerOf("R1-H1"), winnerOf("R1-H2")]);
    expect(r2[3].slots.map((s) => s.entrantId)).toEqual([winnerOf("R1-H7"), winnerOf("R1-H8")]);
    expect(divisionPlacings(done)).toHaveLength(24);
  });

  it("the plan itself: heat counts 8 / 4 / 2 and a Final of 2", () => {
    const plan = planKnockout(24, { limits: heatLimits(3, 3, 3), advance: 1, finalSize: 2 });
    expect(plan.rounds.map((r) => r.heats.length)).toEqual([8, 4, 2]);
    expect(plan.rounds.map((r) => r.oneVOne)).toEqual([false, true, true]);
    expect(plan.finalSize).toBe(2);
  });
});

describe("2G7 16 riders, target 4, minimum 3, maximum 4, 2 advance, final of 4", () => {
  const d = draw(16, { heatSize: 4, minHeatSize: 3, maxHeatSize: 4, advancePerHeat: 2, finalSize: 4 });
  it("R1 4 heats of 4 → SF 2 heats of 4 → F 1 heat of 4", () => {
    expect(sizes(d)).toEqual([["R1", [4, 4, 4, 4]], ["SF", [4, 4]], ["F", [4]]]);
  });
  it("the semi-finals pair R1's neighbouring heats: H1 + H2 (top 2 of each), H3 + H4", () => {
    expect(shape(d, "SF")).toEqual([["H1p1", "H1p2", "H2p1", "H2p2"], ["H3p1", "H3p2", "H4p1", "H4p2"]]);
  });
});

describe("2G7 21 riders, target 3, minimum 3, maximum 3, 1 advances, final of 2", () => {
  const d = draw(21, { heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2 });
  it("R1 7 heats of 3 → 7 winners cannot form heats of 3, so heats of 2 and one of 3 → 3 winners", () => {
    expect(sizes(d)[0]).toEqual(["R1", Array(7).fill(3)]);
    expect(sizes(d)[1]).toEqual(["R2", [2, 2, 3]]);
    expect(round(d, "R2").expectedEntrants).toBe(7);
  });
  it("the 3 winners fit one heat of 3 (the maximum), so that heat is the Final: the size of 2 is a target, exceeded only because R2 cannot produce 2", () => {
    expect(d.rounds.map((r) => r.id)).toEqual(["R1", "R2", "F"]);
    expect(heatSizes(d, "F")).toEqual([3]);
  });
  it("nobody advances without riding and every rider is placed", () => {
    expect(d.rounds.every((r) => r.heats.every((h) => !h.bye && h.slots.length >= 2))).toBe(true);
    expect(divisionPlacings(publishAll(d))).toHaveLength(21);
  });
});

describe("2G7 seeding into the next round", () => {
  const base = { heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2 };
  it("'By original seeding' (the default) pairs adjacent heats; the preset defaults to it", () => {
    expect(loadFormat("heats4-top2-single-elim").generator!.type).toBe("single_elimination");
    const d = expandFormat(loadFormat("heats4-top2-single-elim", (j) => Object.assign(j.generator.params, base)), makeEntrants(24));
    expect(shape(d, "R2")[0]).toEqual(["H1p1", "H2p1"]);
    expect(round(d, "R2").spec.seeding).toBe("adjacent");
  });
  it("'By their result' is the alternative: winners are re-seeded by result and dealt in a snake, so H1's winner does not simply meet H2's", () => {
    const d = draw(24, { ...base, reseed: "by_place_then_score" });
    expect(round(d, "R2").spec.seeding).toBe("snake");
    expect(shape(d, "R2")[0]).toEqual(["H1p1", "H8p1"]); // best with worst of the eight winners
    expect(sizes(d).map(([, s]) => s.length)).toEqual([8, 4, 2, 1]); // the same ladder shape either way
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// Property test: every combination of target, minimum, maximum, advance and final size, for 4…40 riders.
// ---------------------------------------------------------------------------------------------------------------------------
describe("2G7 property: the sizing rule holds in every round of every knockout", () => {
  const combos: Array<{ target: number; min: number; max: number; advance: number; final: number }> = [];
  for (let target = 2; target <= 6; target++)
    for (let min = 2; min <= target; min++)
      for (let max = target; max <= Math.min(10, target + 2); max++)
        for (let advance = 1; advance < target; advance++)
          for (const final of [2, 3, 4, 6]) combos.push({ target, min, max, advance, final });

  it(`the planner, for ${combos.length} settings × N = 4…40`, () => {
    let checked = 0;
    for (const c of combos) {
      const limits = heatLimits(c.target, c.min, c.max);
      for (let n = 4; n <= 40; n++) {
        const plan = planKnockout(n, { limits, advance: c.advance, finalSize: c.final });
        const ctx = `t${c.target} min${c.min} max${c.max} a${c.advance} f${c.final} N=${n}`;
        let riders = n;
        for (const r of plan.rounds) {
          const caps = r.heats;
          expect(caps.reduce((a, b) => a + b, 0), ctx).toBe(riders);
          expect(caps.length, `${ctx}: a round before the final has at least 2 heats`).toBeGreaterThanOrEqual(2);
          expect(Math.min(...caps), `${ctx}: nobody advances without riding`).toBeGreaterThanOrEqual(2);
          if (limits.max >= 3) expect(Math.max(...caps), `${ctx}: never above the maximum`).toBeLessThanOrEqual(limits.max);
          if (feasibleHeatCounts(riders, limits).length > 0) expect(Math.min(...caps), `${ctx}: at least the minimum when it can be kept`).toBeGreaterThanOrEqual(limits.min);
          else expect(r.oneVOne, `${ctx}: the 1 v 1 fallback`).toBe(true);
          const advancing = r.advance;
          expect(advancing, ctx).toBeGreaterThanOrEqual(1);
          expect(advancing, `${ctx}: somebody is out of every heat`).toBeLessThan(Math.min(...caps));
          riders = caps.length * advancing;
          checked++;
        }
        expect(plan.finalSize, ctx).toBe(riders);
        if (plan.finalSize > c.final && limits.max >= 3) expect(plan.finalSize, `${ctx}: the final is above its target only within the maximum`).toBeLessThanOrEqual(Math.max(limits.max, c.final));
      }
    }
    expect(checked).toBeGreaterThan(20000);
  });

  it("expandFormat, for a spread of settings × N = 4…40: sizes, rounds, byes, placings", () => {
    const sample = combos.filter((_, i) => i % 7 === 0);
    for (const c of sample) {
      const params = { heatSize: c.target, minHeatSize: c.min, maxHeatSize: c.max, advancePerHeat: c.advance, finalSize: c.final };
      const limits = heatLimits(c.target, c.min, c.max);
      for (let n = 4; n <= 40; n += 3) {
        const d = draw(n, params);
        const ctx = `t${c.target} min${c.min} max${c.max} a${c.advance} f${c.final} N=${n}`;
        expect(d.rounds.at(-1)!.heats, ctx).toHaveLength(1);
        d.rounds.forEach((r, i) => {
          const last = i === d.rounds.length - 1;
          if (!last) expect(r.heats.length, `${ctx} ${r.id}: at least 2 heats`).toBeGreaterThanOrEqual(2);
          for (const h of r.heats) {
            expect(h.bye, `${ctx} ${r.id}: nobody advances without riding`).toBe(false);
            if (!last && limits.max >= 3) expect(h.slots.length, `${ctx} ${r.id}: never above the maximum`).toBeLessThanOrEqual(limits.max);
            if (!last) expect(h.slots.length, `${ctx} ${r.id}`).toBeGreaterThanOrEqual(2);
          }
        });
        expect(divisionPlacings(publishAll(d)), ctx).toHaveLength(n);
      }
    }
  }, 120_000);
});
