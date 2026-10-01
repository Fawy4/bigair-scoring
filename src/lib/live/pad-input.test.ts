import { describe, expect, it } from "vitest";
import { parsePadInput } from "./score-pad";

// Tap or type (owner, round 4): a small number field with the numeric keyboard next to the two pad rows. Typed values pass the same step and range check as taps.
const TENTHS = { min: 0, max: 10, step: 0.1 };
describe("typing a score", () => {
  it("accepts a whole number and a decimal", () => {
    expect(parsePadInput("7", TENTHS)).toEqual({ ok: true, value: 7 });
    expect(parsePadInput("7.5", TENTHS)).toEqual({ ok: true, value: 7.5 });
  });
  it("accepts a comma as the decimal sign (numeric keyboards in many countries)", () => expect(parsePadInput("7,5", TENTHS)).toEqual({ ok: true, value: 7.5 }));
  it("ignores spaces", () => expect(parsePadInput("  8.2 ", TENTHS)).toEqual({ ok: true, value: 8.2 }));
  it("refuses 8.55 on a 0.1 step, like the pad", () => expect(parsePadInput("8.55", TENTHS)).toEqual({ ok: false, reason: "off_step" }));
  it("refuses a score outside the scale", () => {
    expect(parsePadInput("10.5", TENTHS)).toEqual({ ok: false, reason: "out_of_range" });
    expect(parsePadInput("-1", TENTHS)).toEqual({ ok: false, reason: "out_of_range" });
  });
  it("refuses words and an empty field", () => {
    expect(parsePadInput("abc", TENTHS)).toEqual({ ok: false, reason: "not_a_number" });
    expect(parsePadInput("", TENTHS)).toEqual({ ok: false, reason: "empty" });
    expect(parsePadInput("7.", TENTHS)).toEqual({ ok: true, value: 7 });
  });
});
