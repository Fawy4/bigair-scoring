// Doc 08 §2C — KOTA dingle elimination (Decision 4): N = 18 (22 heats) and N = 12 (byes to the top seeds).
import { describe, expect, it } from "vitest";
import { expandFormat } from "./expand";
import { heat, heatSizes, loadFormat, makeEntrants, publishAll, publishRound, round, seeds, shape } from "./fixtures";
import { divisionPlacings } from "./placings";

const kota = () => loadFormat("kota-dingle");

describe("2C dingle_elimination, N = 18", () => {
  const draw = expandFormat(kota(), makeEntrants(18));

  it("R1 6 heats of 3; R2 6 heats of 2; R3 6 heats of 2; SF 3 heats of 2; Final 1 heat of 3 = 22 heats", () => {
    expect(draw.rounds.map((r) => [r.id, r.heats.length])).toEqual([["R1", 6], ["R2", 6], ["R3", 6], ["SF", 3], ["F", 1]]);
    expect(draw.rounds.flatMap((r) => r.heats)).toHaveLength(22);
    expect(heatSizes(draw, "R1")).toEqual([3, 3, 3, 3, 3, 3]);
    expect(heatSizes(draw, "R2")).toEqual([2, 2, 2, 2, 2, 2]);
    expect(heatSizes(draw, "R3")).toEqual([2, 2, 2, 2, 2, 2]);
    expect(heatSizes(draw, "SF")).toEqual([2, 2, 2]);
    expect(heatSizes(draw, "F")).toEqual([3]);
    expect(draw.rounds.map((r) => r.expectedEntrants)).toEqual([18, 12, 12, 6, 3]);
  });

  it("durations 13 / 10 / 10 / 10 / 15 and heats are numbered 1..22", () => {
    expect(draw.rounds.map((r) => r.heats[0].durationMin)).toEqual([13, 10, 10, 10, 15]);
    expect(draw.rounds.flatMap((r) => r.heats.map((h) => h.number))).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
  });

  it("flag-out is available only in R1, at minute 8, count 1", () => {
    expect(draw.template.flagOut).toEqual({ rounds: ["R1"], atMin: 8, count: 1 });
  });

  it("later rounds start as placeholders ('Winner H2')", () => {
    const r3 = shape(draw, "R3");
    expect(r3.flat().every((s) => /^H\d+p1$/.test(s))).toBe(true);
    expect(round(draw, "R2").seeded).toBe(false);
    expect(round(draw, "R1").seeded).toBe(true);
  });

  it("R1 winners → R3, 2nd/3rd → R2 (reseeded by place then score), R2 winners → R3", () => {
    let d = publishRound(draw, "R1");
    expect(round(d, "R2").seeded).toBe(true);
    expect(seeds(d, "R2")).toEqual([[7, 18], [8, 17], [9, 16], [10, 15], [11, 14], [12, 13]]);
    expect(round(d, "R3").seeded).toBe(false);
    d = publishRound(d, "R2");
    expect(seeds(d, "R3")).toEqual([[1, 12], [2, 11], [3, 10], [4, 9], [5, 8], [6, 7]]);
    d = publishRound(d, "R3");
    expect(seeds(d, "SF")).toEqual([[1, 6], [2, 5], [3, 4]]);
    d = publishRound(d, "SF");
    expect(seeds(d, "F")).toEqual([[1, 2, 3]]);
  });

  it("placings: R2 losers 13=, R3 losers 7=, SF losers 4=, final 1..3", () => {
    const placings = divisionPlacings(publishAll(draw));
    expect(placings).toHaveLength(18);
    const at = (label: string) => placings.filter((p) => p.label === label);
    expect(at("13=")).toHaveLength(6);
    expect(at("7=")).toHaveLength(6);
    expect(at("4=")).toHaveLength(3);
    expect(placings.filter((p) => p.place <= 3).map((p) => [p.place, p.entrantId])).toEqual([[1, "r1"], [2, "r2"], [3, "r3"]]);
    expect(new Set(placings.filter((p) => p.label === "13=").map((p) => p.place))).toEqual(new Set([13]));
    expect(new Set(placings.filter((p) => p.label === "7=").map((p) => p.place))).toEqual(new Set([7]));
  });
});

describe("2C dingle_elimination, N = 12 — byes go to the top seeds (Decisions 4, 5)", () => {
  const draw = expandFormat(kota(), makeEntrants(12));

  it("R1 4 heats · R2 4 heats · R3 4 heats · SF 3 heats (2 byes + 1 heat) · Final", () => {
    expect(draw.rounds.map((r) => [r.id, r.heats.length])).toEqual([["R1", 4], ["R2", 4], ["R3", 4], ["SF", 3], ["F", 1]]);
    expect(draw.rounds.map((r) => r.expectedEntrants)).toEqual([12, 8, 8, 4, 3]);
    expect(heatSizes(draw, "SF")).toEqual([1, 1, 2]);
    expect(round(draw, "SF").heats.map((h) => h.bye)).toEqual([true, true, false]);
  });

  it("byes have no heat number: 14 numbered heats in total", () => {
    const numbered = draw.rounds.flatMap((r) => r.heats).filter((h) => h.number !== null);
    expect(numbered).toHaveLength(14);
    expect(round(draw, "SF").heats.map((h) => h.number)).toEqual([null, null, 13]);
  });

  it("the two best R3 winners get the byes and go straight to the Final; the rest ride the SF heat", () => {
    let d = publishRound(publishRound(publishRound(draw, "R1"), "R2"), "R3");
    // R3 winners: seeds 1..4 (highest totals). SF: [bye 1] [bye 2] [3 v 4].
    expect(seeds(d, "SF")).toEqual([[1], [2], [3, 4]]);
    expect(round(d, "F").arrivals.map((a) => a.originalSeed)).toEqual([1, 2]);
    d = publishRound(d, "SF");
    expect(seeds(d, "F")).toEqual([[1, 2, 3]]);
  });

  it("placings: R2 losers 9=, R3 losers 5=, SF loser 4, final 1..3", () => {
    const placings = divisionPlacings(publishAll(draw));
    expect(placings).toHaveLength(12);
    expect(placings.filter((p) => p.label === "9=")).toHaveLength(4);
    expect(placings.filter((p) => p.label === "5=")).toHaveLength(4);
    expect(placings.filter((p) => p.label === "4")).toHaveLength(1);
    expect(placings.filter((p) => p.place <= 3).map((p) => p.entrantId)).toEqual(["r1", "r2", "r3"]);
  });

  it("a bye heat is never published by hand", () => {
    const d = publishRound(publishRound(publishRound(draw, "R1"), "R2"), "R3");
    expect(heat(d, "SF-H1").bye).toBe(true);
    expect(d.results["SF-H1"]).toBeUndefined();
  });
});

describe("2C dingle_elimination — other field sizes always reach a final of 3", () => {
  it("N = 6 … 36 all terminate in one heat of 3 and place every rider once", () => {
    for (let n = 6; n <= 36; n++) {
      const draw = expandFormat(kota(), makeEntrants(n));
      expect(draw.rounds.at(-1)!.heats.map((h) => h.slots.length)).toEqual([3]);
      const placings = divisionPlacings(publishAll(draw));
      expect(new Set(placings.map((p) => p.entrantId)).size).toBe(n);
    }
  });
});
