import { describe, expect, it } from "vitest";
import { computeHeat, explain, judgeTrickScore } from "./index";
import { crashed, hetx, impressions, J3, landed, preset } from "./fixtures";
import type { Attempt, HeatInput } from "./types";

// doc 08 §1A — KOTA preset, 3 judges (trimmed_mean falls back to mean below 5 judges).
function redAttempts(): Attempt[] {
  return [
    landed(1, [hetx(8.0, 7.5, 7.0, 8.0), hetx(8.5, 8.0, 7.0, 7.5), hetx(8.0, 7.5, 7.5, 8.0)], { trickName: "Kiteloop board-off" }),
    landed(2, [hetx(9.0, 9.0, 8.0, 7.0), hetx(9.0, 8.5, 8.0, 7.5), hetx(8.5, 9.0, 8.5, 7.0)], { trickName: "Double loop" }),
    landed(3, [hetx(7.0, 7.0, 6.5, 8.5), hetx(7.5, 7.0, 7.0, 8.0), hetx(7.0, 6.5, 7.0, 8.5)], { trickName: "Late backroll kiteloop" }),
    crashed(4, { trickName: "Board-off" }),
    landed(5, [hetx(8.5, 8.0, 7.5, 8.5), hetx(8.0, 8.0, 8.0, 8.0), hetx(8.5, 8.5, 7.5, 8.0)], { trickName: "Contra loop" }),
  ];
}

function heat(attempts = redAttempts(), extra: Partial<HeatInput["riders"][number]> = {}): HeatInput {
  return {
    panelJudgeIds: J3,
    riders: [{ riderId: "Red", attempts, impressionMarks: impressions([7.5, 7.0, 8.0]), ...extra }],
  };
}

describe("1A — KOTA best 3 + impression", () => {
  const model = preset("kota-best3-impression");

  it("judge trick scores are the plain mean of the four criteria", () => {
    expect(judgeTrickScore(model, hetx(8.0, 7.5, 7.0, 8.0)).score).toBeCloseTo(7.625, 10);
    expect(judgeTrickScore(model, hetx(7.5, 7.0, 7.0, 8.0)).score).toBeCloseTo(7.375, 10);
    expect(judgeTrickScore(model, hetx(8.0, 8.0, 8.0, 8.0)).score).toBeCloseTo(8.0, 10);
  });

  it("panel scores, counted tricks, impression, total and percent", () => {
    const r = computeHeat(model, heat()).riders[0];
    expect(r.allAttempts.map((a) => a.panel?.score ?? null)).toEqual([7.71, 8.25, 7.29, null, 8.08]);
    expect(r.counted.map((c) => c.attemptSeq)).toEqual([2, 5, 1]);
    expect(r.counted.map((c) => c.score)).toEqual([8.25, 8.08, 7.71]);
    expect(r.components.tricks).toBe(24.04);
    expect(r.components.impression).toBe(7.5);
    expect(r.total).toBe(31.54);
    expect(r.percent).toBe(78.85);
    expect(r.flags.incomplete).toBe(false);
  });

  it("lists attempt 4 as crashed and not counted", () => {
    const a4 = computeHeat(model, heat()).riders[0].allAttempts.find((a) => a.seq === 4)!;
    expect(a4.status).toBe("crashed");
    expect(a4.counted).toBe(false);
  });

  it("keeps unrounded panel values in the breakdown", () => {
    const a1 = computeHeat(model, heat()).riders[0].allAttempts[0];
    expect(a1.panel?.unrounded).toBeCloseTo(7.708333333, 8);
  });

  it("no publish blockers when every mark is in", () => {
    expect(computeHeat(model, heat()).publishBlockers).toEqual([]);
  });

  it("explain() gives plain-language lines", () => {
    const lines = explain(computeHeat(model, heat()).riders[0], model);
    expect(lines.join("\n")).toContain("8.25 + 8.08 + 7.71 = 24.04");
    expect(lines.join("\n")).toContain("31.54");
  });

  describe("1A-i — J3 has not scored attempt 3", () => {
    const attempts = redAttempts();
    attempts[2].marks = attempts[2].marks.filter((m) => m.judgeId !== "J3");
    const res = computeHeat(model, heat(attempts));
    const a3 = res.riders[0].allAttempts[2];

    it("panel from the two available judges, incomplete, J3 missing", () => {
      expect(a3.panel?.score).toBe(7.31);
      expect(a3.panel?.incomplete).toBe(true);
      expect(a3.panel?.missing).toEqual(["J3"]);
      expect(res.riders[0].flags.incomplete).toBe(true);
    });

    it("total unchanged because attempt 3 is not counted", () => {
      expect(res.riders[0].total).toBe(31.54);
    });

    it("publishing is blocked while requireAllJudges", () => {
      expect(res.publishBlockers).toContainEqual({ type: "score_missing", judge: "J3", rider: "Red", attemptSeq: 3 });
    });
  });

  describe("1A-ii — interference drop_best_trick", () => {
    const r = computeHeat(model, heat(redAttempts(), { modifiers: [{ type: "INT" }] })).riders[0];

    it("drops the best trick and recounts", () => {
      expect(r.counted.map((c) => c.score)).toEqual([8.08, 7.71, 7.29]);
      expect(r.allAttempts.find((a) => a.seq === 2)?.ignored).toBe("interference_dropped");
      expect(r.components.penalty).toBe(0.96);
      expect(r.total).toBe(30.58);
    });
  });

  describe("Missed (doc 08 §1F)", () => {
    it("J3 Missed on attempt 3 → panel from J1, J2 = 7.31, not incomplete", () => {
      const attempts = redAttempts();
      attempts[2].marks = attempts[2].marks.map((m) => (m.judgeId === "J3" ? { ...m, value: "missed" as const } : m));
      const res = computeHeat(model, heat(attempts));
      const a3 = res.riders[0].allAttempts[2];
      expect(a3.panel?.score).toBe(7.31);
      expect(a3.panel?.missedBy).toEqual(["J3"]);
      expect(a3.panel?.incomplete).toBe(false);
      expect(res.publishBlockers).toEqual([]);
    });

    it("all three judges Missed → no panel score, not counted", () => {
      const attempts = redAttempts();
      attempts[1].marks = J3.map((judgeId) => ({ judgeId, value: "missed" as const }));
      const r = computeHeat(model, heat(attempts)).riders[0];
      expect(r.allAttempts[1].panel?.score).toBeNull();
      expect(r.allAttempts[1].counted).toBe(false);
      expect(r.counted.map((c) => c.attemptSeq)).toEqual([5, 1, 3]);
    });
  });

  describe("Impression required (doc 08 §1F)", () => {
    it("J3's impression absent → publish blocker", () => {
      const res = computeHeat(model, heat(redAttempts(), { impressionMarks: impressions([7.5, 7.0]) }));
      expect(res.publishBlockers).toContainEqual({ type: "impression_missing", judge: "J3", rider: "Red" });
    });

    it("required = false → no blocker, impression from J1, J2 = 7.25", () => {
      const m = preset("kota-best3-impression", (x) => {
        x.heat.impression!.required = false;
      });
      const res = computeHeat(m, heat(redAttempts(), { impressionMarks: impressions([7.5, 7.0]) }));
      expect(res.publishBlockers).toEqual([]);
      expect(res.riders[0].components.impression).toBe(7.25);
    });
  });
});
