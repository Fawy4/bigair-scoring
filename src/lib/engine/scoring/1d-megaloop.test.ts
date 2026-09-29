import { describe, expect, it } from "vitest";
import { computeHeat, judgeTrickScore } from "./index";
import { etsl, J3, landed, preset } from "./fixtures";

// doc 08 §1D — Megaloop: weighted 0.70 / 0.15 / 0.10 / 0.05, single best jump.
describe("1D — Megaloop single best", () => {
  const model = preset("megaloop-single-best");
  const attempts = [
    landed(1, [etsl(9.0, 7.0, 8.0, 6.0), etsl(8.5, 7.5, 8.0, 7.0), etsl(9.0, 7.0, 7.5, 6.5)]),
    landed(2, [etsl(7.0, 9.0, 9.0, 9.0), etsl(7.5, 9.0, 8.5, 9.0), etsl(7.0, 8.5, 9.0, 9.5)]),
  ];
  const r = computeHeat(model, { panelJudgeIds: J3, riders: [{ riderId: "Red", attempts }] }).riders[0];

  it("weighted judge scores 8.45 / 8.225 / 8.425", () => {
    expect(judgeTrickScore(model, etsl(9.0, 7.0, 8.0, 6.0)).score).toBeCloseTo(8.45, 10);
    expect(judgeTrickScore(model, etsl(8.5, 7.5, 8.0, 7.0)).score).toBeCloseTo(8.225, 10);
    expect(judgeTrickScore(model, etsl(9.0, 7.0, 7.5, 6.5)).score).toBeCloseTo(8.425, 10);
  });

  it("panels 8.37 and 7.68", () => {
    expect(r.allAttempts.map((a) => a.panel?.score)).toEqual([8.37, 7.68]);
  });

  it("heat total = single best = 8.37; jump 2 not counted", () => {
    expect(r.total).toBe(8.37);
    expect(r.allAttempts[1].counted).toBe(false);
    expect(r.allAttempts[1].ignored).toBe("not_selected");
  });
});
