import { describe, expect, it } from "vitest";
import { attemptLabel, attemptTone, shadeIndex, type AttemptDisplay } from "./result-shading";

// Public result rows (owner, round 3): crash red, not counted grey, counted green shaded from darkest (highest counted) to lightest (lowest counted).
describe("shade of a counted trick", () => {
  it("the highest counted trick is the darkest (0), the lowest the lightest", () => {
    expect(shadeIndex(0, 3, 4)).toBe(0);
    expect(shadeIndex(2, 3, 4)).toBe(3);
  });
  it("the middle one lies between (best 3: 0, 2, 3 of 4 steps)", () => {
    expect([0, 1, 2].map((r) => shadeIndex(r, 3, 4))).toEqual([0, 2, 3]);
  });
  it("one counted trick is the darkest; two are the darkest and the lightest", () => {
    expect(shadeIndex(0, 1, 4)).toBe(0);
    expect([0, 1].map((r) => shadeIndex(r, 2, 4))).toEqual([0, 3]);
  });
  it("never leaves the scale", () => {
    for (let n = 1; n < 12; n++) {
      for (let r = 0; r < n; r++) {
        const i = shadeIndex(r, n, 4);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe("tone of an attempt line", () => {
  const rows = [
    { seq: 1, status: "landed" as const, counted: true, score: 7.71 },
    { seq: 2, status: "landed" as const, counted: true, score: 8.25 },
    { seq: 3, status: "landed" as const, counted: false, score: 7.29 },
    { seq: 4, status: "crashed" as const, counted: false, score: null },
    { seq: 5, status: "landed" as const, counted: true, score: 8.08 },
  ];
  it("crash is red, not counted is grey, counted is green with a shade by score (8.25 darkest, 7.71 lightest)", () => {
    const t = Object.fromEntries(rows.map((r) => [r.seq, attemptTone(r, rows)]));
    expect(t[4]).toEqual({ kind: "crash" });
    expect(t[3]).toEqual({ kind: "notCounted" });
    expect(t[2]).toEqual({ kind: "counted", shade: 0 });
    expect(t[5]).toEqual({ kind: "counted", shade: 2 });
    expect(t[1]).toEqual({ kind: "counted", shade: 3 });
  });
});

describe("what spectators see per attempt (a division setting)", () => {
  const a = { seq: 2, trick: "Double loop", scoreLabel: "8.25", status: "landed" as const };
  const labels = (mode: AttemptDisplay) => attemptLabel(a, mode);
  it("default: trick name + score", () => expect(labels("trick_score")).toEqual({ left: "2. Double loop", right: "8.25" }));
  it("attempt number + score", () => expect(labels("number_score")).toEqual({ left: "Attempt 2", right: "8.25" }));
  it("scores only", () => expect(labels("scores_only")).toEqual({ left: "", right: "8.25" }));
  it("a crash never shows a score; it says CRASH in every mode", () => {
    const c = { seq: 4, trick: "Board-off", scoreLabel: null, status: "crashed" as const };
    expect(attemptLabel(c, "trick_score").right).toBe("");
    expect(attemptLabel(c, "scores_only").left).toBe("");
  });
});
