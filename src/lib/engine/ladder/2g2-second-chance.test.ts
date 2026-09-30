// Doc 08 §2G2 — "Knockout with a second chance": every round follows the sizing rule (docs/04 decision 26).
// No heat is smaller than the minimum, nobody advances without riding, every non-final round has at least two heats,
// and (unless the organiser limits the second chance) every rider rides at least two heats before being out.
import { describe, expect, it } from "vitest";
import type { FormatTemplate } from "@/lib/schemas/format-template";
import { expandFormat } from "./expand";
import { heatSizes, loadFormat, makeEntrants, publishAll, publishRound, round, seeds } from "./fixtures";
import { minHeatsPerRider } from "./minimum";
import { divisionPlacings } from "./placings";
import { planSecondChance } from "./second-chance-plan";
import { heatLimits } from "./seeding";
import type { DivisionDraw, DrawRound } from "./types";

const second = (params: Record<string, unknown> = {}): FormatTemplate => loadFormat("kota-dingle", (j) => Object.assign(j.generator.params, params));
const draw = (n: number, params: Record<string, unknown> = {}) => expandFormat(second(params), makeEntrants(n));
const sizes = (d: DivisionDraw) => d.rounds.map((r) => [r.id, heatSizes(d, r.id)] as const);

/** Riders who ride in a round vs riders who skip it (an "advances without riding" heat). A round where more skip than ride is invalid. */
const riding = (r: DrawRound) => r.heats.filter((h) => !h.bye).reduce((s, h) => s + h.slots.length, 0);
const skipping = (r: DrawRound) => r.heats.filter((h) => h.bye).reduce((s, h) => s + h.slots.length, 0);

const SETS: Array<{ name: string; params: Record<string, unknown> }> = [
  { name: "3 / default / default (2–4)", params: {} },
  { name: "3 / 3 / 4", params: { minHeatSize: 3, maxHeatSize: 4 } },
  { name: "4 / 3 / 4", params: { r1HeatSize: 4, minHeatSize: 3, maxHeatSize: 4 } },
];

describe("2G2 the owner's example: 14 riders, target 3, minimum 3, maximum 4", () => {
  const params = { r1HeatSize: 3, minHeatSize: 3, maxHeatSize: 4 };
  const d = draw(14, params);

  it("R1 3/3/4/4 → the 4 winners go to the main draw, everyone else gets a second chance", () => {
    expect(sizes(d)[0]).toEqual(["R1", [3, 3, 4, 4]]);
    expect(round(d, "R2").expectedEntrants).toBe(10); // 14 − 4 winners
  });

  it("the second-chance round holds 10 riders in heats of 3–4; its 3 winners join the 4 R1 winners in a round of 7", () => {
    expect(heatSizes(d, "R2")).toEqual([3, 3, 4]);
    expect(round(d, "SF").expectedEntrants).toBe(7);
  });

  it("7 riders → 2 heats (3 and 4), the top 2 of each ride the Final of 4: no rider skips a round", () => {
    expect(heatSizes(d, "SF")).toEqual([3, 4]);
    expect(d.rounds.map((r) => r.id)).toEqual(["R1", "R2", "SF", "F"]);
    expect(heatSizes(d, "F")).toEqual([4]);
    expect(d.rounds.flatMap((r) => r.heats).some((h) => h.bye)).toBe(false);
  });

  it("every rider rides at least 2 heats", () => {
    expect(minHeatsPerRider(d)).toBe(2);
  });

  it("with only 2nd and 3rd getting a second chance (4th is out): 8 riders in 2 heats of 4, then 6 riders in 2 heats of 3 → Final of 4", () => {
    const limited = draw(14, { ...params, secondChancePlaces: 2 });
    expect(sizes(limited)).toEqual([["R1", [3, 3, 4, 4]], ["R2", [4, 4]], ["SF", [3, 3]], ["F", [4]]]);
    expect(round(limited, "R2").expectedEntrants).toBe(8);
    expect(minHeatsPerRider(limited)).toBe(1); // the 4th of a 4-rider heat is out after one heat
  });
});

describe("2G2 14, 16 and 18 riders: no heat below the minimum, everyone rides at least 2 heats", () => {
  for (const { name, params } of SETS) {
    for (const n of [14, 16, 18]) {
      it(`${name}, N = ${n}`, () => {
        const d = draw(n, params);
        const limits = heatLimits((params.r1HeatSize as number | undefined) ?? 3, params.minHeatSize as number | undefined, params.maxHeatSize as number | undefined);
        for (const r of d.rounds) {
          for (const h of r.heats) {
            expect(h.slots.length, `${r.id} ${h.id}`).toBeGreaterThanOrEqual(limits.min);
            expect(h.slots.length, `${r.id} ${h.id}`).toBeLessThanOrEqual(limits.max);
            expect(h.bye, `${r.id} ${h.id} advances without riding`).toBe(false);
          }
        }
        expect(d.warnings.filter((w) => w.type === "heat_size_limits")).toEqual([]);
        expect(minHeatsPerRider(d), "heats per rider").toBeGreaterThanOrEqual(2);
      });
    }
  }
});

describe("2G2 the rounds converge on the Final without anyone skipping a round", () => {
  for (const { name, params } of SETS) {
    it(`${name}: N = 8, 10, 12, 14, 16, 18, 24 — every non-final round has at least 2 real heats and nobody skips`, () => {
      for (const n of [8, 10, 12, 14, 16, 18, 24]) {
        const d = draw(n, params);
        const at = `${name} N=${n} ${JSON.stringify(sizes(d))}`;
        d.rounds.slice(0, -1).forEach((r) => {
          expect(r.heats.filter((h) => !h.bye).length, `${at}: ${r.id} real heats`).toBeGreaterThanOrEqual(2);
          expect(skipping(r), `${at}: ${r.id} riders who skip`).toBe(0);
          expect(skipping(r), `${at}: ${r.id} more skip than ride`).toBeLessThan(riding(r));
        });
        const final = d.rounds.at(-1)!;
        expect(final.heats, `${at}: one final heat`).toHaveLength(1);
        expect(final.heats[0].slots.length, `${at}: final size`).toBeGreaterThanOrEqual(2);
        expect(d.rounds.map((r) => r.id).slice(-1), at).toEqual(["F"]);
      }
    });
  }

  it("a semi-final where fewer riders ride than skip is invalid (the check catches it) and no generated ladder has one", () => {
    // 3 riders skip, only 2 ride: the check must flag it.
    const oneRide = { heats: [{ bye: true, slots: [1] }, { bye: true, slots: [1] }, { bye: true, slots: [1] }, { bye: false, slots: [1, 2] }] } as unknown as DrawRound;
    expect(skipping(oneRide)).toBeGreaterThan(riding(oneRide));
    // the generated ladders never contain a rider who skips, at any field size or setting
    for (const { name, params } of SETS) for (let n = 2; n <= 40; n++) expect(draw(n, params).rounds.some((r) => skipping(r) > 0), `${name} N=${n}`).toBe(false);
  });

  it("6 riders left in the main draw: the top 2 of 2 heats of 3 make a Final of 4, rather than letting anyone skip", () => {
    const plan = planSecondChance(12, { limits: heatLimits(3, 3, 4), finalSize: 3 });
    expect(plan.r1).toEqual([3, 3, 3, 3]);
    expect(plan.secondChance).toEqual({ heats: 2, advance: 1 }); // 8 riders in 2 heats of 4; 4 winners + 2 = 6
    expect(plan.main).toEqual([{ heats: 2, advance: 2 }]);
    expect(plan.finalSize).toBe(4);
  });
});

describe("2G2 seeds, places and results", () => {
  const d = draw(14, { minHeatSize: 3, maxHeatSize: 4 });

  it("R1 is dealt 3/3/4/4 with the top seeds in the smaller heats", () => {
    expect(seeds(d, "R1")).toEqual([[1, 8, 9], [2, 7, 10], [3, 6, 11, 14], [4, 5, 12, 13]]);
  });

  it("R1 winners go to the main draw; the others to the second-chance round; second-chance winners join the main draw", () => {
    let x = publishRound(d, "R1");
    expect(round(x, "R2").seeded).toBe(true);
    expect(seeds(x, "R2").flat().sort((a, b) => a - b)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(round(x, "SF").seeded).toBe(false);
    x = publishRound(x, "R2");
    expect(round(x, "SF").seeded).toBe(true);
    expect(seeds(x, "SF").flat().sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    x = publishRound(x, "SF");
    expect(seeds(x, "F")[0].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it("every rider is placed once", () => {
    const placings = divisionPlacings(publishAll(d));
    expect(new Set(placings.map((p) => p.entrantId)).size).toBe(14);
    expect(placings.filter((p) => p.place <= 4).map((p) => p.entrantId)).toEqual(["r1", "r2", "r3", "r4"]);
  });
});

describe("2G2 every field size runs", () => {
  it("N = 2 … 40: the ladder reaches one Final heat and places every rider once, whatever the numbers", () => {
    for (const { name, params } of SETS) {
      for (let n = 2; n <= 40; n++) {
        const d = draw(n, params);
        expect(d.rounds.at(-1)!.heats.length, `${name} N=${n}`).toBe(1);
        expect(new Set(divisionPlacings(publishAll(d)).map((p) => p.entrantId)).size, `${name} N=${n}`).toBe(n);
      }
    }
  });

  it("target 2 gives 1 v 1 style heats and still runs at every field size", () => {
    for (let n = 2; n <= 40; n++) {
      const d = draw(n, { r1HeatSize: 2 });
      expect(d.rounds.at(-1)!.heats.length, `N=${n}`).toBe(1);
      expect(d.rounds.flatMap((r) => r.heats).some((h) => h.bye), `N=${n}`).toBe(false);
    }
    expect(heatSizes(draw(12, { r1HeatSize: 2 }), "R1")).toEqual([2, 2, 2, 2, 2, 2]);
  });

  it("small fields that cannot keep all three numbers are warned about, never silently broken", () => {
    const d = draw(6, { minHeatSize: 3, maxHeatSize: 4 });
    // 6 riders: R1 3+3, the 4 others cannot make two heats of at least 3 → one heat of 4
    expect(heatSizes(d, "R2")).toEqual([4]);
    const tiny = draw(8, { r1HeatSize: 4, minHeatSize: 4, maxHeatSize: 5 });
    expect(tiny.warnings.some((w) => w.type === "heat_size_limits")).toBe(true);
  });
});
