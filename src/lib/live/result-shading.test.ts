import { describe, expect, it } from "vitest";
import { ATTEMPT_DISPLAYS, boxText, boxTone, DEFAULT_ATTEMPT_DISPLAY, gradeIndex, type AttemptDisplay } from "./result-shading";

// Public heat summary (owner, round 4): crash red, not counted grey, counted graded yellow to green ACROSS THE HEAT: the highest counted score in the heat is the greenest,
// the lowest counted the yellowest. A box shows attempt number + score (Arrow's default), trick name + score, or the score only.
describe("grade of a counted score across the heat", () => {
  it("the highest counted score is the greenest (4 of 0–4), the lowest the yellowest (0)", () => {
    expect(gradeIndex(8.25, 5.3, 8.25, 5)).toBe(4);
    expect(gradeIndex(5.3, 5.3, 8.25, 5)).toBe(0);
  });
  it("a score in the middle lies in the middle", () => expect(gradeIndex(6.8, 5.3, 8.3, 5)).toBe(2));
  it("when every counted score is equal the box is greenest", () => expect(gradeIndex(7, 7, 7, 5)).toBe(4));
  it("never leaves the scale", () => {
    for (const s of [0, 1, 4.4, 9.9, 10]) {
      const i = gradeIndex(s, 1, 9, 5);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThanOrEqual(4);
    }
  });
});

describe("tone of a box", () => {
  const heat = [8.25, 8.08, 7.71, 5.3];
  it("a crash is red", () => expect(boxTone({ status: "crashed", counted: false, score: null }, heat)).toEqual({ kind: "crash" }));
  it("not counted is grey, whatever its score", () => expect(boxTone({ status: "landed", counted: false, score: 7.29 }, heat)).toEqual({ kind: "notCounted" }));
  it("counted is graded across the heat, not within the rider", () => {
    expect(boxTone({ status: "landed", counted: true, score: 8.25 }, heat)).toEqual({ kind: "counted", grade: 4 });
    expect(boxTone({ status: "landed", counted: true, score: 5.3 }, heat)).toEqual({ kind: "counted", grade: 0 });
  });
});

describe("what a box shows (a division setting)", () => {
  const a = { seq: 2, trick: "Double loop", scoreLabel: "8.25", status: "landed" as const };
  const crash = { seq: 4, trick: "Board-off", scoreLabel: null, status: "crashed" as const };
  it("Arrow's default is attempt number + score", () => {
    expect(DEFAULT_ATTEMPT_DISPLAY).toBe("number_score");
    expect(ATTEMPT_DISPLAYS[0]).toBe("number_score");
  });
  const t = (m: AttemptDisplay, x: Parameters<typeof boxText>[0] = a) => boxText(x, m);
  it("attempt number + score", () => expect(t("number_score")).toBe("2 · 8.25"));
  it("trick name + score", () => expect(t("trick_score")).toBe("Double loop · 8.25"));
  it("scores only", () => expect(t("scores_only")).toBe("8.25"));
  it("a crash says CRASH and never shows a score", () => {
    expect(t("scores_only", crash)).toBe("CRASH");
    expect(t("number_score", crash)).toBe("4 · CRASH");
    expect(t("trick_score", crash)).toBe("Board-off · CRASH");
  });
});
