import { describe, expect, it } from "vitest";
import { computeHeat, judgeTrickScore } from "./index";
import { hrti, J3, landed, preset } from "./fixtures";

// doc 08 §1C — PUKL preset: criteria SUM (H 0–3, R 0–3, T 0–3, I 0–1), best 3, 3 judges, no impression.
describe("1C — PUKL points (sum)", () => {
  const model = preset("pukl-points");
  const attempts = [
    landed(1, [hrti(2.5, 2.0, 2.0, 0), hrti(2.5, 2.5, 2.0, 0), hrti(2.0, 2.0, 2.5, 0)]),
    landed(2, [hrti(3.0, 3.0, 2.5, 1), hrti(3.0, 2.5, 2.5, 0), hrti(3.0, 3.0, 2.0, 1)]),
    landed(3, [hrti(1.5, 1.0, 1.5, 0), hrti(2.0, 1.5, 1.0, 0), hrti(1.5, 1.5, 1.5, 0)]),
    landed(4, [hrti(2.5, 3.0, 2.0, 0), hrti(2.5, 2.5, 2.5, 0), hrti(3.0, 2.5, 2.0, 0)]),
  ];
  const r = computeHeat(model, { panelJudgeIds: J3, riders: [{ riderId: "Red", attempts }] }).riders[0];

  it("judge trick score is the sum of criteria", () => {
    expect(judgeTrickScore(model, hrti(3.0, 3.0, 2.5, 1)).score).toBe(9.5);
  });

  it("panel scores 6.67 / 8.83 / 4.33 / 7.50", () => {
    expect(r.allAttempts.map((a) => a.panel?.score)).toEqual([6.67, 8.83, 4.33, 7.5]);
  });

  it("counts attempts 2, 4, 1 → total 23.00 of 30, no impression", () => {
    expect(r.counted.map((c) => c.attemptSeq)).toEqual([2, 4, 1]);
    expect(r.total).toBe(23.0);
    expect(r.components.impression).toBe(0);
    expect(r.impression).toBeNull();
  });
});
