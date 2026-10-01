import { describe, expect, it } from "vitest";
import { KOTA } from "./design-fixtures";
import { cellTone, distanceBand, outlierTolerance } from "./cell-tone";

// Head judge's table (owner, round 4): each judge's cell is coloured by its distance from the panel score, high and low alike: within tolerance green,
// further away through yellow to red. The tolerance is the scoring model's outlier threshold.
describe("tolerance", () => {
  it("is the model's outlier threshold: 15 % of the 0–10 scale = 1.5 for KOTA", () => expect(outlierTolerance(KOTA)).toBeCloseTo(1.5, 10));
  it("follows the model: a 0–3 scale at 15 % is 0.45", () => {
    const m = structuredClone(KOTA);
    m.trick.scale = { min: 0, max: 3, step: 0.5 };
    expect(outlierTolerance(m)).toBeCloseTo(0.45, 10);
  });
});

describe("bands", () => {
  const tol = 1.5;
  it("within tolerance is green (0)", () => {
    expect(distanceBand(0, tol)).toBe(0);
    expect(distanceBand(1.5, tol)).toBe(0);
  });
  it("further away runs through yellow (1) and orange (2) to red (3)", () => {
    expect(distanceBand(1.6, tol)).toBe(1);
    expect(distanceBand(2.25, tol)).toBe(1);
    expect(distanceBand(2.4, tol)).toBe(2);
    expect(distanceBand(3.0, tol)).toBe(2);
    expect(distanceBand(3.1, tol)).toBe(3);
  });
});

describe("a cell", () => {
  it("is measured high and low alike: 6.0 and 9.0 around a panel score of 7.5 are the same band", () => {
    expect(cellTone(6.0, 7.5, 1.5).band).toBe(cellTone(9.0, 7.5, 1.5).band);
  });
  it("carries the signed distance as text so colour is never alone (+0.4, −1.6)", () => {
    expect(cellTone(7.9, 7.5, 1.5)).toMatchObject({ band: 0, delta: "+0.4" });
    expect(cellTone(5.9, 7.5, 1.5)).toMatchObject({ band: 1, delta: "−1.6" });
  });
  it("the docs/08 §1A attempt 1: 7.625, 7.75, 7.75 around 7.71 are all green", () => {
    for (const s of [7.625, 7.75, 7.75]) expect(cellTone(s, 7.71, 1.5).band).toBe(0);
  });
  it("no delta is shown when the score is the panel score", () => expect(cellTone(7.5, 7.5, 1.5).delta).toBe(""));
});
