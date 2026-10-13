import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cssVarName, LARGE, NORMAL, SIZE_RANGES } from "./size-tokens";

// docs/06 §00.2 after the owner's tests on an iPhone 14 (1 Oct, then 12 Oct 2026): calmer, smaller text by default, the previous Normal as "Large"; tap targets never below 44 px.
describe("Normal text size stays inside the owner's ranges", () => {
  it.each(Object.entries(SIZE_RANGES))("%s", (key, [min, max]) => {
    const v = NORMAL[key as keyof typeof NORMAL];
    expect(v, `${key} = ${v}`).toBeGreaterThanOrEqual(min);
    expect(v, `${key} = ${v}`).toBeLessThanOrEqual(max);
  });
  it("every tap target is at least 44 px: pad buttons, rows, chips and the bottom bar", () => {
    for (const k of ["padHeight", "tap", "row", "bar"] as const) expect(NORMAL[k], k).toBeGreaterThanOrEqual(44);
  });
  it("digits and every typed-in box are at least 16 px (iPhone Safari zooms into anything smaller)", () => expect(NORMAL.digit).toBeGreaterThanOrEqual(16));
  it("the timer is 48 px only on the head console and the big screen; elsewhere it is slim", () => {
    expect(NORMAL.timerHead).toBe(48);
    expect(NORMAL.timerSlim).toBeLessThan(NORMAL.timerHead);
  });
  it("the selected score is the only large number: bigger than every other size on the screen", () => {
    for (const k of ["body", "small", "name", "digit", "heading", "timerSlim", "composed"] as const) expect(NORMAL.readout).toBeGreaterThan(NORMAL[k]);
  });
  it("buttons are never smaller than a pad button's height", () => expect(NORMAL.tap).toBeLessThanOrEqual(NORMAL.padHeight));
});

describe("Large is about what Normal was in 0.20.0 (the New look)", () => {
  it("text as 0.20.0's Normal (body 14, names 15, status words 12), digits 17, pad buttons 48 with 6 px gaps", () => {
    expect([LARGE.body, LARGE.name, LARGE.small, LARGE.digit, LARGE.padHeight, LARGE.padGap, LARGE.tap]).toEqual([14, 15, 12, 17, 48, 6, 48]);
  });
  it("Normal's text is one step smaller than Large's", () => {
    expect(NORMAL.body).toBeLessThan(LARGE.body);
    expect(NORMAL.name).toBeLessThan(LARGE.name);
  });
  it("is never smaller than Normal, anywhere", () => {
    for (const k of Object.keys(NORMAL) as Array<keyof typeof NORMAL>) expect(LARGE[k], k).toBeGreaterThanOrEqual(NORMAL[k]);
  });
});

describe("globals.css carries exactly these sizes", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const block = (cls: string) => css.match(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  it.each([
    ["beach-text-normal", NORMAL],
    ["beach-text-large", LARGE],
  ] as const)("%s", (cls, sizes) => {
    const body = block(cls);
    expect(body, cls).not.toBe("");
    for (const [key, px] of Object.entries(sizes)) expect(body, `${cls} ${key}`).toContain(`${cssVarName(key)}: ${px}px;`);
  });
});
