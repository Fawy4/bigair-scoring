// Doc 08 §2C — knockout with a second chance (docs/04 decisions 4 and 26), preset "kota-dingle" (target 3; default minimum 2 and maximum 4).
// N = 18: R1 6 heats of 3 · Second-chance round 4 heats of 3 · Round 3 4 heats (2, 2, 3, 3) · Final of 4 = 15 heats.
// Every round follows the sizing rule; nobody advances without riding. The general rules are tested in 2G2.
import { describe, expect, it } from "vitest";
import { expandFormat } from "./expand";
import { heatSizes, loadFormat, makeEntrants, publishAll, publishRound, round, seeds, shape } from "./fixtures";
import { divisionPlacings } from "./placings";

const kota = () => loadFormat("kota-dingle");

describe("2C second chance, N = 18", () => {
  const draw = expandFormat(kota(), makeEntrants(18));

  it("R1 6 heats of 3; Second chance 4 heats of 3; R3 4 heats of 2/2/3/3; Final 1 heat of 4 = 15 heats", () => {
    expect(draw.rounds.map((r) => [r.id, r.heats.length])).toEqual([["R1", 6], ["R2", 4], ["R3", 4], ["F", 1]]);
    expect(draw.rounds.flatMap((r) => r.heats)).toHaveLength(15);
    expect(heatSizes(draw, "R1")).toEqual([3, 3, 3, 3, 3, 3]);
    expect(heatSizes(draw, "R2")).toEqual([3, 3, 3, 3]);
    expect(heatSizes(draw, "R3")).toEqual([2, 2, 3, 3]);
    expect(heatSizes(draw, "F")).toEqual([4]);
    expect(draw.rounds.map((r) => r.expectedEntrants)).toEqual([18, 12, 10, 4]);
    expect(draw.rounds.map((r) => r.name)).toEqual(["Round 1", "Second-chance round", "Round 3", "Final"]);
  });

  it("nobody advances without riding, and no warnings", () => {
    expect(draw.rounds.flatMap((r) => r.heats).some((h) => h.bye)).toBe(false);
    expect(draw.warnings).toEqual([]);
  });

  it("durations 13 / 10 / 10 / 15 and heats are numbered 1..15", () => {
    expect(draw.rounds.map((r) => r.heats[0].durationMin)).toEqual([13, 10, 10, 15]);
    expect(draw.rounds.flatMap((r) => r.heats.map((h) => h.number))).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });

  it("flag-out is available only in R1, at minute 8, count 1", () => {
    expect(draw.template.flagOut).toEqual({ rounds: ["R1"], atMin: 8, count: 1 });
  });

  it("later rounds start as placeholders ('1st H2')", () => {
    expect(shape(draw, "R3").flat().every((s) => /^H\d+p1$/.test(s))).toBe(true);
    expect(round(draw, "R2").seeded).toBe(false);
    expect(round(draw, "R1").seeded).toBe(true);
    expect(seeds(draw, "R1")).toEqual([[1, 12, 13], [2, 11, 14], [3, 10, 15], [4, 9, 16], [5, 8, 17], [6, 7, 18]]);
  });

  it("R1 winners → R3, everyone else → Second chance (reseeded by place then score), Second-chance winners → R3", () => {
    let d = publishRound(draw, "R1");
    expect(round(d, "R2").seeded).toBe(true);
    // 2nd places first (7..12), then 3rd places (13..18), snaked over 4 heats of 3
    expect(seeds(d, "R2")).toEqual([[7, 14, 15], [8, 13, 16], [9, 12, 17], [10, 11, 18]]);
    expect(round(d, "R3").seeded).toBe(false);
    d = publishRound(d, "R2");
    expect(seeds(d, "R3")).toEqual([[1, 8], [2, 7], [3, 6, 9], [4, 5, 10]]); // top seeds in the smaller heats
    d = publishRound(d, "R3");
    expect(seeds(d, "F")).toEqual([[1, 2, 3, 4]]);
  });

  it("placings: Second-chance losers 11=, R3 losers 5=, final 1..4", () => {
    const placings = divisionPlacings(publishAll(draw));
    expect(placings).toHaveLength(18);
    const at = (label: string) => placings.filter((p) => p.label === label);
    expect(at("11=")).toHaveLength(8);
    expect(at("5=")).toHaveLength(6);
    expect(placings.filter((p) => p.place <= 4).map((p) => [p.place, p.entrantId])).toEqual([[1, "r1"], [2, "r2"], [3, "r3"], [4, "r4"]]);
    expect(new Set(at("11=").map((p) => p.place))).toEqual(new Set([11]));
    expect(new Set(at("5=").map((p) => p.place))).toEqual(new Set([5]));
  });
});

describe("2C second chance, N = 12", () => {
  const draw = expandFormat(kota(), makeEntrants(12));

  it("R1 4 heats of 3 · Second chance 3 heats of 2/3/3 · R3 3 heats of 2/2/3 · Final of 3, and nobody advances without riding", () => {
    expect(draw.rounds.map((r) => [r.id, heatSizes(draw, r.id)])).toEqual([["R1", [3, 3, 3, 3]], ["R2", [2, 3, 3]], ["R3", [2, 2, 3]], ["F", [3]]]);
    expect(draw.rounds.flatMap((r) => r.heats).some((h) => h.bye)).toBe(false);
  });

  it("byes have no heat number because there are none: every heat is numbered", () => {
    const numbers = draw.rounds.flatMap((r) => r.heats.map((h) => h.number));
    expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, i) => i + 1));
  });
});

describe("2C second chance — other field sizes always reach one final and place every rider once", () => {
  it("N = 6 … 36", () => {
    for (let n = 6; n <= 36; n++) {
      const draw = expandFormat(kota(), makeEntrants(n));
      expect(draw.rounds.at(-1)!.heats).toHaveLength(1);
      const placings = divisionPlacings(publishAll(draw));
      expect(new Set(placings.map((p) => p.entrantId)).size).toBe(n);
    }
  });
});
