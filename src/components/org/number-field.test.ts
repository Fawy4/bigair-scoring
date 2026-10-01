import { describe, expect, it } from "vitest";
import { decimalsOf, numberFieldChars, numberFieldWidth } from "./number-field-width";

// docs/PLAN-phase-7a.md step 8b: the width is the digits of the largest allowed value, plus the decimals, plus one for a minus sign.
describe("number field width", () => {
  it("max 9 needs 1 digit", () => expect(numberFieldChars({ min: 0, max: 9 })).toBe(1));
  it("max 30 needs 2", () => expect(numberFieldChars({ min: 0, max: 30 })).toBe(2));
  it("0 to 10 in steps of 0.5 needs 4 characters (10.5)", () => expect(numberFieldChars({ min: 0, max: 10, step: 0.5 })).toBe(4));
  it("max 999 needs 3", () => expect(numberFieldChars({ min: 0, max: 999 })).toBe(3));
  it("a negative minimum adds one for the minus sign", () => {
    expect(numberFieldChars({ min: -5, max: 5 })).toBe(2);
    expect(numberFieldChars({ min: -10, max: 10 })).toBe(3);
  });
  it("two decimals add three characters (a point and two digits)", () => expect(numberFieldChars({ min: 0, max: 9, step: 0.25 })).toBe(4));
  it("the larger of the two ends decides the digits", () => expect(numberFieldChars({ min: -100, max: 9 })).toBe(4));
  it("reads decimals from the step", () => {
    expect(decimalsOf(1)).toBe(0);
    expect(decimalsOf(0.5)).toBe(1);
    expect(decimalsOf(0.25)).toBe(2);
    expect(decimalsOf(undefined)).toBe(0);
  });
  it("is never full width: a CSS width in ch units plus the box, with the control height as the floor", () => {
    expect(numberFieldWidth({ min: 0, max: 30 })).toBe("calc(2ch + 28px)");
    expect(numberFieldWidth({ min: 0, max: 10, step: 0.5 })).toBe("calc(4ch + 28px)");
  });
});
