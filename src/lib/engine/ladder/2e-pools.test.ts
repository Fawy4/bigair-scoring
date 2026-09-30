// Doc 08 §2E — pools_to_final, N = 23, heatSize 10, finalists 6; one and two pool rounds (Decision 7).
import { describe, expect, it } from "vitest";
import { expandFormat } from "./expand";
import { heat, heatSizes, loadFormat, makeEntrants, publish, publishRound, round, seeds } from "./fixtures";
import { divisionPlacings } from "./placings";

const pools = (params: Record<string, unknown> = {}) =>
  loadFormat("pools-to-final", (j) => Object.assign(j.generator.params, params));

describe("2E pools_to_final, one pool round, N = 23", () => {
  const draw = expandFormat(pools(), makeEntrants(23));

  it("3 pool heats sized 7 / 8 / 8 (smaller heat for the top seeds), then one Final of 6", () => {
    expect(draw.rounds.map((r) => [r.id, r.heats.length])).toEqual([["P1", 3], ["F", 1]]);
    expect(heatSizes(draw, "P1")).toEqual([7, 8, 8]);
    expect(heatSizes(draw, "F")).toEqual([6]);
    expect(draw.rounds[0].heats[0].durationMin).toBe(12);
    expect(draw.rounds[1].heats[0].durationMin).toBe(15);
  });

  it("pool 1 holds seed 1; the snake spreads the top seeds", () => {
    expect(seeds(draw, "P1")[0].slice(0, 3)).toEqual([1, 6, 7]);
  });

  it("the Final is seeded once all three pools are published: top 6 by total across pools", () => {
    // Seeds 1-5 score 90..82 and seed 9 / seed 7 tie for 6th; everyone else lower.
    const score = (s: number) => (s <= 5 ? 92 - 2 * s : s === 7 ? 80 : s === 9 ? 80 : 70 - s);
    let d = publish(draw, "P1-H1", score);
    d = publish(d, "P1-H2", score);
    expect(round(d, "F").seeded).toBe(false);
    d = publish(d, "P1-H3", score);
    expect(round(d, "F").seeded).toBe(true);
    // 7 and 9 tie on 80 and on tie-break keys → the original seed decides: 7 makes the final.
    expect(seeds(d, "F")).toEqual([[1, 2, 3, 4, 5, 7]]);
    const placings = divisionPlacings(d);
    expect(placings.find((p) => p.entrantId === "r9")?.place).toBe(7);
  });

  it("a cross-pool tie uses the scoring model's tie-break keys before the original seed", () => {
    const score = (s: number) => {
      if (s <= 5) return 92 - 2 * s;
      if (s === 7) return { total: 80, tieKeys: [8.0, 7.0] };
      if (s === 9) return { total: 80, tieKeys: [8.5, 1.0] };
      return 70 - s;
    };
    let d = draw;
    for (const h of ["P1-H1", "P1-H2", "P1-H3"]) d = publish(d, h, score);
    expect(seeds(d, "F")).toEqual([[1, 2, 3, 4, 5, 9]]);
    expect(divisionPlacings(d).find((p) => p.entrantId === "r7")?.place).toBe(7);
  });

  it("everybody gets an individual place: eliminated pool riders are ranked by total (by_heat_score)", () => {
    let d = draw;
    for (const h of ["P1-H1", "P1-H2", "P1-H3"]) d = publish(d, h);
    d = publishRound(d, "F");
    const placings = divisionPlacings(d);
    expect(placings.map((p) => p.place)).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
    expect(placings.every((p) => !p.shared)).toBe(true);
    expect(placings.slice(0, 6).map((p) => p.entrantId)).toEqual(["r1", "r2", "r3", "r4", "r5", "r6"]);
    expect(placings[6].entrantId).toBe("r7");
  });

  it("with fewer riders than finalists everybody rides one final", () => {
    const small = expandFormat(pools(), makeEntrants(5));
    expect(small.rounds.map((r) => r.id)).toEqual(["F"]);
    expect(heatSizes(small, "F")).toEqual([5]);
  });
});

describe("2E pools_to_final, poolRounds = 2", () => {
  const two = (combine: "best" | "sum") => expandFormat(pools({ poolRounds: 2, poolCombine: combine }), makeEntrants(23));
  // Seeds 1-6: strong in pool 1 only. Seeds 7-12: modest in pool 1, strong in pool 2. Others weak.
  const score = (round: "P1" | "P2") => (s: number) =>
    round === "P1" ? (s <= 6 ? 100 - s : s <= 12 ? 50 : 10) : s <= 6 ? 5 : s <= 12 ? 96 - s : 10;
  const play = (d: ReturnType<typeof two>) => {
    let x = publishRound(d, "P1", score("P1"));
    x = publishRound(x, "P2", score("P2"));
    return x;
  };

  it("has two pool rounds and a final", () => {
    expect(two("best").rounds.map((r) => [r.id, r.heats.length])).toEqual([["P1", 3], ["P2", 3], ["F", 1]]);
  });

  it("pool round 2 is dealt by the round-1 score: the snake starts with the three best scorers", () => {
    const d = publishRound(two("best"), "P1", score("P1"));
    expect(round(d, "P2").seeded).toBe(true);
    const flat = seeds(d, "P2");
    expect([flat[0][0], flat[1][0], flat[2][0]]).toEqual([1, 2, 3]);
    expect(flat.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
  });

  it("pool round 2 is a fresh draw: riders meet different opponents than in round 1", () => {
    // N = 8: round-1 score order is 1, 4, 2, 3, 5, 8, 6, 7 → round-2 heats [1,3,5,7] · [4,2,8,6] (round 1 was [1,4,5,8] · [2,3,6,7]).
    const t = expandFormat(pools({ heatSize: 4, minHeatSize: 3, finalists: 2, poolRounds: 2 }), makeEntrants(8));
    const totals: Record<number, number> = { 1: 90, 4: 80, 2: 70, 3: 60, 5: 50, 8: 40, 6: 30, 7: 20 };
    const d = publishRound(t, "P1", (s) => totals[s]);
    expect(seeds(d, "P1")).toEqual([[1, 4, 5, 8], [2, 3, 6, 7]]);
    expect(seeds(d, "P2")).toEqual([[1, 3, 5, 7], [4, 2, 8, 6]]);
  });

  it("poolCombine = best → the best of the two heat totals decides: seeds 1..6 reach the final", () => {
    const d = play(two("best"));
    expect(seeds(d, "F")).toEqual([[1, 2, 3, 4, 5, 6]]);
  });

  it("poolCombine = sum → the sum decides: seeds 7..12 reach the final", () => {
    const d = play(two("sum"));
    expect(seeds(d, "F")).toEqual([[7, 8, 9, 10, 11, 12]]);
  });

  it("for `sum`, a tie is decided by the tie-break keys of the better single heat, then by seed (Decision 7)", () => {
    const t = expandFormat(pools({ heatSize: 4, minHeatSize: 3, finalists: 2, poolRounds: 2, poolCombine: "sum" }), makeEntrants(8));
    // seed1 dominates. Seed 2: 60 + 40 = 100 (better heat 60, keys [7]). Seed 3: 50 + 50 = 100 (better heat keys [9]).
    const s1 = (s: number) => (s === 1 ? { total: 100, tieKeys: [5] } : s === 2 ? { total: 60, tieKeys: [7] } : s === 3 ? { total: 50, tieKeys: [9] } : { total: 10 - s, tieKeys: [] });
    const s2 = (s: number) => (s === 1 ? { total: 100, tieKeys: [5] } : s === 2 ? { total: 40, tieKeys: [1] } : s === 3 ? { total: 50, tieKeys: [9] } : { total: 10 - s, tieKeys: [] });
    let d = publishRound(t, "P1", s1);
    d = publishRound(d, "P2", s2);
    expect(round(d, "F").heats[0].slots.map((s) => s.seed).sort()).toEqual([1, 3]);
    expect(heat(d, "F-H1").slots).toHaveLength(2);
  });
});
