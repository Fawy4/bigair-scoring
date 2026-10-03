import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { errorSentence } from "./errors";
import { combinePad, decimalsOf, formatPadValue, isAllowed, padLayout, padRefusal, padValues, snapToStep } from "./score-pad";

// docs/08 §1F: "Value not on step (8.55 on step 0.1) → validation error." The pad can only produce values that pass; typed or restored values are checked here.
const TENTHS = { min: 0, max: 10, step: 0.1 };
const HALVES = { min: 0, max: 3, step: 0.5 };
const WHOLE = { min: 1, max: 5, step: 1 };

describe("score pad: which values exist", () => {
  it("lists every step with no binary noise (0.3 is 0.3, not 0.30000000000000004)", () => {
    const v = padValues(TENTHS);
    expect(v).toHaveLength(101);
    expect(v[3]).toBe(0.3);
    expect(v[75]).toBe(7.5);
    expect(v.at(-1)).toBe(10);
  });
  it("starts at the scale's own minimum", () => {
    expect(padValues(WHOLE)).toEqual([1, 2, 3, 4, 5]);
    expect(padValues(HALVES)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3]);
  });
});

describe("score pad: layout", () => {
  it("a long scale is two taps: a whole number row, then a tenths row", () => {
    const l = padLayout(TENTHS);
    expect(l.kind).toBe("split");
    if (l.kind !== "split") return;
    expect(l.wholes).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(l.fractions).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
  });
  it("a short scale is one row (0–3 by 0.5, like the PUKL criteria)", () => {
    const l = padLayout(HALVES);
    expect(l).toEqual({ kind: "single", values: [0, 0.5, 1, 1.5, 2, 2.5, 3] });
  });
  it("whole-number scales are one row", () => {
    expect(padLayout(WHOLE).kind).toBe("single");
  });
  it("every scale in every scoring preset fits in rows of at most 12 buttons", () => {
    const scales: Array<{ min: number; max: number; step: number }> = [];
    const visit = (v: unknown, key: string) => {
      if (key === "scale" && v && typeof v === "object") scales.push(v as { min: number; max: number; step: number });
      else if (Array.isArray(v)) v.forEach((x) => visit(x, key));
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) visit(x, k);
    };
    for (const f of readdirSync("presets/scoring")) visit(JSON.parse(readFileSync(join("presets/scoring", f), "utf8")), "");
    expect(scales.length).toBeGreaterThan(10);
    for (const s of scales) {
      const l = padLayout(s);
      const biggest = l.kind === "single" ? l.values.length : Math.max(l.wholes.length, l.fractions.length);
      expect(biggest, JSON.stringify(s)).toBeLessThanOrEqual(12);
    }
  });
  it("min 2.5 on step 0.5 keeps its own start", () => {
    const l = padLayout({ min: 2.5, max: 9.5, step: 0.5 });
    expect(l.kind).toBe("split");
    if (l.kind !== "split") return;
    expect(l.wholes[0]).toBe(2);
    expect(l.fractions).toEqual([0, 0.5]);
  });
});

describe("score pad: combining the two taps", () => {
  it("8 then .5 is 8.5", () => expect(combinePad(8, 0.5, TENTHS)).toBe(8.5));
  it("7 then .3 is 7.3 exactly", () => expect(combinePad(7, 0.3, TENTHS)).toBe(7.3));
  it("10 then .0 is the maximum; 10 then .5 does not exist", () => {
    expect(combinePad(10, 0, TENTHS)).toBe(10);
    expect(combinePad(10, 0.5, TENTHS)).toBeNull();
  });
  it("below the minimum does not exist: with a minimum of 2.5, 2 then .0 is refused and 2 then .5 is the minimum", () => {
    expect(combinePad(2, 0, { min: 2.5, max: 9.5, step: 0.5 })).toBeNull();
    expect(combinePad(2, 0.5, { min: 2.5, max: 9.5, step: 0.5 })).toBe(2.5);
  });
});

describe("score pad: validation (8.55 on step 0.1 is refused)", () => {
  it("refuses 8.55", () => expect(isAllowed(8.55, TENTHS)).toEqual({ ok: false, reason: "off_step" }));
  it("accepts 8.5 and 0 and 10", () => {
    expect(isAllowed(8.5, TENTHS)).toEqual({ ok: true, value: 8.5 });
    expect(isAllowed(0, TENTHS)).toEqual({ ok: true, value: 0 });
    expect(isAllowed(10, TENTHS)).toEqual({ ok: true, value: 10 });
  });
  it("refuses outside the range and non-numbers", () => {
    expect(isAllowed(10.1, TENTHS)).toEqual({ ok: false, reason: "out_of_range" });
    expect(isAllowed(-0.1, TENTHS)).toEqual({ ok: false, reason: "out_of_range" });
    expect(isAllowed(Number.NaN, TENTHS)).toEqual({ ok: false, reason: "not_a_number" });
  });
  it("0.5 steps: 2.25 is refused, 2.5 is fine; steps count from the minimum", () => {
    expect(isAllowed(2.25, HALVES).ok).toBe(false);
    expect(isAllowed(2.5, HALVES).ok).toBe(true);
    expect(isAllowed(3, { min: 0.25, max: 3.25, step: 0.5 }).ok).toBe(false);
    expect(isAllowed(0.75, { min: 0.25, max: 3.25, step: 0.5 }).ok).toBe(true);
  });
  it("agrees with the engine on every value of every pad", () => {
    for (const v of padValues(TENTHS)) expect(isAllowed(v, TENTHS).ok).toBe(true);
  });
});

describe("score pad: snapping a restored or dragged value", () => {
  it("snaps to the nearest step, halves up", () => {
    expect(snapToStep(8.55, TENTHS)).toBe(8.6);
    expect(snapToStep(8.549, TENTHS)).toBe(8.5);
    expect(snapToStep(7.3, TENTHS)).toBe(7.3);
  });
  it("clamps to the range", () => {
    expect(snapToStep(11, TENTHS)).toBe(10);
    expect(snapToStep(-3, TENTHS)).toBe(0);
  });
});

describe("score pad: how a value is written", () => {
  it("decimals follow the step", () => {
    expect(decimalsOf(0.1)).toBe(1);
    expect(decimalsOf(0.5)).toBe(1);
    expect(decimalsOf(1)).toBe(0);
    expect(decimalsOf(0.25)).toBe(2);
  });
  it("always shows the decimals so 7.0 is not 7", () => {
    expect(formatPadValue(7, TENTHS)).toBe("7.0");
    expect(formatPadValue(7.5, TENTHS)).toBe("7.5");
    expect(formatPadValue(3, WHOLE)).toBe("3");
  });
});

// Polish 2b, item 7: a typed score off the step says why, in the sentence the server uses
describe("score pad: the sentence for a typed score that is refused", () => {
  const step01 = { min: 0, max: 10, step: 0.1 } as Parameters<typeof padRefusal>[1];
  const sentence = (text: string, scale = step01) => {
    const r = padRefusal(text, scale);
    return r ? errorSentence(r.detail ? `${r.code}: ${r.detail}` : r.code) : null;
  };
  it("7.25 on a 0.1 step: the same sentence the database gives", () => {
    expect(sentence("7.25")).toBe("That score is not on the 0.1 step. Use 7.2 or 7.3.");
    expect(sentence("7,25")).toBe("That score is not on the 0.1 step. Use 7.2 or 7.3."); // a comma is the decimal sign
  });
  it("a 0.5 step names that step and its neighbours", () => {
    expect(sentence("7.3", { min: 0, max: 10, step: 0.5 } as typeof step01)).toBe("That score is not on the 0.5 step. Use 7 or 7.5.");
  });
  it("outside the scale names the range", () => {
    expect(sentence("11")).toBe("That score is outside the scale (0 to 10).");
  });
  it("nothing typed, or a score on the step, has no sentence", () => {
    expect(padRefusal("", step01)).toBeNull();
    expect(padRefusal("   ", step01)).toBeNull();
    expect(padRefusal("7.2", step01)).toBeNull();
    expect(padRefusal("7", step01)).toBeNull();
  });
  it("something that is not a number asks for a score", () => {
    expect(sentence("7.2.1")).toBe("Enter a score.");
  });
});
