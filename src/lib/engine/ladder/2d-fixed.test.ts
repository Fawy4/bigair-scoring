// Doc 08 §2D — fixed templates megaloop-men-16 and megaloop-women-6.
import { describe, expect, it } from "vitest";
import { expandFormat } from "./expand";
import { heatSizes, loadFormat, makeEntrants, publishAll, publishRound, round, seeds } from "./fixtures";
import { divisionPlacings } from "./placings";

describe("2D megaloop-men-16", () => {
  const draw = expandFormat(loadFormat("megaloop-men-16"), makeEntrants(16));

  it("R1 8 heats of 2 · R2 4 · R3 6 · SF 3 · Final 1 = 22 heats", () => {
    expect(draw.rounds.map((r) => [r.id, r.heats.length])).toEqual([["R1", 8], ["R2", 4], ["R3", 6], ["SF", 3], ["F", 1]]);
    expect(draw.rounds.flatMap((r) => r.heats)).toHaveLength(22);
    expect(draw.rounds.map((r) => r.expectedEntrants)).toEqual([16, 8, 12, 6, 3]);
    expect(heatSizes(draw, "F")).toEqual([3]);
  });

  it("R1 pairs 1v16, 2v15 … 8v9; winners → R3, losers → R2", () => {
    expect(seeds(draw, "R1")).toEqual([[1, 16], [2, 15], [3, 14], [4, 13], [5, 12], [6, 11], [7, 10], [8, 9]]);
    const d = publishRound(draw, "R1");
    expect(seeds(d, "R2")).toEqual([[9, 16], [10, 15], [11, 14], [12, 13]]);
    expect(round(d, "R3").arrivals.map((a) => a.originalSeed).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("placings: R2 losers 13=, R3 losers 7=, SF losers 4=", () => {
    const placings = divisionPlacings(publishAll(draw));
    expect(placings).toHaveLength(16);
    expect(placings.filter((p) => p.label === "13=")).toHaveLength(4);
    expect(placings.filter((p) => p.label === "7=")).toHaveLength(6);
    expect(placings.filter((p) => p.label === "4=")).toHaveLength(3);
    expect(placings.filter((p) => p.place <= 3).map((p) => p.entrantId)).toEqual(["r1", "r2", "r3"]);
  });

  it("refuses a field that does not fit (too many riders); fewer riders run as one final with a warning", () => {
    expect(() => expandFormat(loadFormat("megaloop-men-16"), makeEntrants(20))).toThrow(/at most 16/);
    const small = expandFormat(loadFormat("megaloop-men-16"), makeEntrants(3));
    expect(small.rounds.map((r) => r.id)).toEqual(["F"]);
    expect(small.warnings.map((w) => w.type)).toContain("below_template_min");
  });
});

describe("2D megaloop-women-6", () => {
  const draw = expandFormat(loadFormat("megaloop-women-6"), makeEntrants(6));

  it("R1 2 heats of 3 → SF 1 heat of 2 → Final of 3", () => {
    expect(draw.rounds.map((r) => [r.id, r.heats.length])).toEqual([["R1", 2], ["SF", 1], ["F", 1]]);
    expect(seeds(draw, "R1")).toEqual([[1, 4, 5], [2, 3, 6]]);
    expect(heatSizes(draw, "SF")).toEqual([2]);
    expect(heatSizes(draw, "F")).toEqual([3]);
  });

  it("winners go to the Final, 2nd places meet in the Semi, its winner takes the last Final spot", () => {
    let d = publishRound(draw, "R1");
    expect(seeds(d, "SF")).toEqual([[3, 4]]);
    expect(round(d, "F").arrivals.map((a) => a.originalSeed).sort((a, b) => a - b)).toEqual([1, 2]);
    d = publishRound(d, "SF");
    expect(seeds(d, "F")).toEqual([[1, 2, 3]]);
  });

  it("placings: 3rd places share 5th, SF loser 4th", () => {
    const placings = divisionPlacings(publishAll(draw));
    expect(placings.filter((p) => p.label === "5=").map((p) => p.entrantId).sort()).toEqual(["r5", "r6"]);
    expect(placings.find((p) => p.label === "4")?.entrantId).toBe("r4");
    expect(placings.filter((p) => p.place <= 3).map((p) => p.entrantId)).toEqual(["r1", "r2", "r3"]);
  });
});
