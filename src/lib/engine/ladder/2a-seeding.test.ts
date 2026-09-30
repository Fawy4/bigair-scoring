// Doc 08 §2A — capacity-aware snake seeding, one_larger_heat, N = 13, "eliminates nobody" (Decisions 2, 3, 5, 6).
import { describe, expect, it } from "vitest";
import { RoundSpecSchema } from "@/lib/schemas/format-template";
import { expandFormat } from "./expand";
import { loadFormat, makeEntrants, seeds } from "./fixtures";
import { capacities, dealSnake, heatCount, roundLayout, shuffleSeeds } from "./seeding";

const single = (params: Record<string, unknown> = {}) =>
  loadFormat("heats4-top2-single-elim", (j) => Object.assign(j.generator.params, params));
const r1 = (n: number, params: Record<string, unknown> = {}) => seeds(expandFormat(single(params), makeEntrants(n)), "R1");
const spec = (heatSize: number, uneven = "smaller_heats_for_top_seeds", heatCountOverride?: number) =>
  RoundSpecSchema.parse({ id: "R1", name: "R1", shortName: "R1", heatSize, uneven, heatCountOverride });
const sizes = (n: number, s: ReturnType<typeof spec>) => roundLayout(n, s).capacities;

describe("2A snake seeding, heat size 4, smaller heats for top seeds", () => {
  const table: Array<[number, number[][]]> = [
    [7, [[1, 4, 5], [2, 3, 6, 7]]],
    [8, [[1, 4, 5, 8], [2, 3, 6, 7]]],
    [10, [[1, 6, 7], [2, 5, 8], [3, 4, 9, 10]]],
    [12, [[1, 6, 7, 12], [2, 5, 8, 11], [3, 4, 9, 10]]],
    [16, [[1, 8, 9, 16], [2, 7, 10, 15], [3, 6, 11, 14], [4, 5, 12, 13]]],
    [18, [[1, 10, 11], [2, 9, 12], [3, 8, 13, 18], [4, 7, 14, 17], [5, 6, 15, 16]]],
    [24, [[1, 12, 13, 24], [2, 11, 14, 23], [3, 10, 15, 22], [4, 9, 16, 21], [5, 8, 17, 20], [6, 7, 18, 19]]],
  ];
  it.each(table)("N = %i", (n, heats) => {
    expect(r1(n)).toEqual(heats);
  });
});

describe("2A snake seeding, heat size 3", () => {
  it("N = 7 → 3 heats", () => {
    expect(r1(7, { heatSize: 3, advancePerHeat: 1 })).toHaveLength(3);
  });
  it("N = 18 → 6 heats of 3", () => {
    expect(r1(18, { heatSize: 3, advancePerHeat: 1 })).toEqual([
      [1, 12, 13], [2, 11, 14], [3, 10, 15], [4, 9, 16], [5, 8, 17], [6, 7, 18],
    ]);
  });
});

describe("2A capacity-aware snake, N = 13", () => {
  it("size 3, smaller heats for top seeds (default)", () => {
    expect(r1(13, { heatSize: 3, advancePerHeat: 1 })).toEqual([[1, 10], [2, 9], [3, 8, 11], [4, 7, 12], [5, 6, 13]]);
  });
  it("size 3, one_larger_heat", () => {
    expect(r1(13, { heatSize: 3, advancePerHeat: 1, uneven: "one_larger_heat" })).toEqual([
      [1, 8, 9], [2, 7, 10], [3, 6, 11], [4, 5, 12, 13],
    ]);
  });
  it("size 4, one_larger_heat", () => {
    expect(r1(13, { uneven: "one_larger_heat" })).toEqual([[1, 6, 7, 12], [2, 5, 8, 11], [3, 4, 9, 10, 13]]);
  });
});

describe("2A one_larger_heat heat counts (Decision 2)", () => {
  const larger = spec(4, "one_larger_heat");
  it("N = 11 → 3 heats 3/4/4: [1,6,7] · [2,5,8,11] · [3,4,9,10]", () => {
    expect(sizes(11, larger)).toEqual([3, 4, 4]);
    expect(r1(11, { uneven: "one_larger_heat" })).toEqual([[1, 6, 7], [2, 5, 8, 11], [3, 4, 9, 10]]);
  });
  it("N = 13 size 3 → 4 heats; N = 13 size 4 → 3 heats", () => {
    expect(heatCount(13, spec(3, "one_larger_heat"))).toBe(4);
    expect(heatCount(13, larger)).toBe(3);
  });
  it("N = 5 → one heat of 5", () => {
    expect(sizes(5, larger)).toEqual([5]);
  });
  it("N = 20 → 5 heats of 4", () => {
    expect(sizes(20, larger)).toEqual([4, 4, 4, 4, 4]);
  });
  it("N = 25 → 6 heats 4/4/4/4/4/5 (not five heats of 5)", () => {
    expect(sizes(25, larger)).toEqual([4, 4, 4, 4, 4, 5]);
  });
  it("N = 30 → 7 heats 4/4/4/4/4/5/5", () => {
    expect(sizes(30, larger)).toEqual([4, 4, 4, 4, 4, 5, 5]);
  });
  it("no heat ever exceeds heatSize + 1, for any N", () => {
    for (const size of [2, 3, 4, 6, 10]) {
      for (let n = 1; n <= 80; n++) {
        const caps = sizes(n, spec(size, "one_larger_heat"));
        expect(Math.max(...caps)).toBeLessThanOrEqual(size + 1);
        expect(caps.reduce((a, b) => a + b, 0)).toBe(n);
      }
    }
  });
});

describe("2A helpers", () => {
  it("capacities put the smaller heats first", () => {
    expect(capacities(13, 5)).toEqual([2, 2, 3, 3, 3]);
    expect(capacities(8, 2)).toEqual([4, 4]);
  });
  it("dealSnake skips full heats", () => {
    expect(dealSnake([1, 2, 3, 4, 5, 6, 7], [3, 4])).toEqual([[1, 4, 5], [2, 3, 6, 7]]);
  });
  it("heatCountOverride wins over `uneven`", () => {
    expect(heatCount(13, spec(4, "smaller_heats_for_top_seeds", 5))).toBe(5);
    expect(heatCount(13, spec(4, "one_larger_heat", 2))).toBe(2);
  });
  it("shuffleSeeds is reproducible from its seed and differs between seeds", () => {
    const e = makeEntrants(12);
    const a = shuffleSeeds(e, 42).map((x) => x.id);
    expect(shuffleSeeds(e, 42).map((x) => x.id)).toEqual(a);
    expect(shuffleSeeds(e, 43).map((x) => x.id)).not.toEqual(a);
    expect([...a].sort()).toEqual(e.map((x) => x.id).sort());
  });
});

describe("2A byes_top_seeds (Decision 6)", () => {
  const t = () => single({ uneven: "byes_top_seeds" });
  it("N = 10: 2 byes for seeds 1 and 2, two full heats for the rest", () => {
    const draw = expandFormat(t(), makeEntrants(10));
    expect(seeds(draw, "R1")).toEqual([[1], [2], [3, 6, 7, 10], [4, 5, 8, 9]]);
    const heats = draw.rounds[0].heats;
    expect(heats.map((h) => h.bye)).toEqual([true, true, false, false]);
    expect(heats.map((h) => h.number)).toEqual([null, null, 1, 2]);
  });
  it("byes advance at once: the next round already holds seeds 1 and 2", () => {
    const draw = expandFormat(t(), makeEntrants(10));
    expect(draw.rounds[1].arrivals.map((a) => a.originalSeed)).toEqual([1, 2]);
  });
  it("N = 8 needs no byes", () => {
    expect(seeds(expandFormat(t(), makeEntrants(8)), "R1")).toEqual([[1, 4, 5, 8], [2, 3, 6, 7]]);
  });
  it("heatCountOverride turns byes off", () => {
    const draw = expandFormat(t(), makeEntrants(10), { heatCountOverride: { R1: 3 } });
    expect(seeds(draw, "R1")).toEqual([[1, 6, 7], [2, 5, 8], [3, 4, 9, 10]]);
  });
});

describe("2A 'eliminates nobody' (Decision 3)", () => {
  // With the default minimum (target − 1 = 3) five riders are one heat (docs/04 decision 23). A minimum of 2 gives the earlier split.
  // (The default knockout now advances only 1 from a heat of two, so nothing is left to warn about: docs/04 decision 33. The warning still
  // exists for the older "smaller heats for top seeds" rule, which is what this test uses.)
  it("N = 5, size 4, minimum 2, top 2 advance → [1,4] · [2,3,5] and a warning for Heat 1", () => {
    const draw = expandFormat(single({ minHeatSize: 2, uneven: "smaller_heats_for_top_seeds" }), makeEntrants(5));
    expect(seeds(draw, "R1")).toEqual([[1, 4], [2, 3, 5]]);
    const w = draw.warnings.filter((x) => x.type === "eliminates_nobody");
    expect(w).toHaveLength(1);
    expect(w[0].message).toBe("Heat 1 eliminates nobody (2 riders, top 2 advance)");
    expect(w[0].heatId).toBe("R1-H1");
    expect(w[0].suggestion).toContain("heatCountOverride");
  });
  it("no warning when every heat eliminates somebody, and none for the KOTA/Megaloop rounds that never eliminate in R1", () => {
    expect(expandFormat(single(), makeEntrants(12)).warnings.filter((x) => x.type === "eliminates_nobody")).toEqual([]);
    expect(expandFormat(loadFormat("kota-dingle"), makeEntrants(18)).warnings).toEqual([]);
  });
  it("the heatCountOverride suggestion clears the warning", () => {
    const draw = expandFormat(single({ minHeatSize: 2 }), makeEntrants(5), { heatCountOverride: { R1: 1 } });
    expect(seeds(draw, "R1")).toEqual([[1, 2, 3, 4, 5]]);
    expect(draw.warnings.filter((x) => x.type === "eliminates_nobody")).toEqual([]);
  });
});

describe("2A heat numbering (Decision 5)", () => {
  it("is division-wide and sequential; byes carry no number", () => {
    // Only a hand-chosen rule can still give a bye ("Advances without riding"); the generated second-chance ladders never do.
    const draw = expandFormat(single({ uneven: "byes_top_seeds" }), makeEntrants(10));
    const numbers = draw.rounds.flatMap((r) => r.heats.map((h) => h.number)).filter((n) => n !== null);
    expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, i) => i + 1));
    expect(draw.rounds[0].heats.filter((h) => h.bye)).toHaveLength(2);
    expect(draw.rounds.flatMap((r) => r.heats).filter((h) => h.bye).every((h) => h.number === null)).toBe(true);
  });
});

describe("2A random seeding", () => {
  const random = () => single({ seeding: "random" });
  it("stores the rng seed so the draw is reproducible", () => {
    const a = expandFormat(random(), makeEntrants(10), { rngSeed: 7 });
    const b = expandFormat(random(), makeEntrants(10), { rngSeed: 7 });
    expect(a.rngSeed).toBe(7);
    expect(a.seedOrder).toEqual(b.seedOrder);
    expect(a.seedOrder).not.toEqual(makeEntrants(10).map((e) => e.id));
    expect(seeds(a, "R1").flat().sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it("without an rng seed it stays deterministic (no clock, no Math.random) and says which seed it used", () => {
    const a = expandFormat(random(), makeEntrants(10));
    const b = expandFormat(random(), makeEntrants(10));
    expect(a.seedOrder).toEqual(b.seedOrder);
    expect(typeof a.rngSeed).toBe("number");
    expect(a.warnings.some((w) => w.type === "random_seed_defaulted")).toBe(true);
  });
});
