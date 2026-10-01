import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cssVarName, LARGE, NORMAL, SIZE_RANGES } from "./size-tokens";

// docs/06 §00.2 after the owner's outdoor test on an iPhone 14 (1 Oct 2026): calmer, smaller sizes by default, today's sizes as "Large".
describe("Normal text size stays inside the owner's ranges", () => {
  it.each(Object.entries(SIZE_RANGES))("%s", (key, [min, max]) => {
    const v = NORMAL[key as keyof typeof NORMAL];
    expect(v, `${key} = ${v}`).toBeGreaterThanOrEqual(min);
    expect(v, `${key} = ${v}`).toBeLessThanOrEqual(max);
  });
  it("the timer is 48 px only on the head console and the big screen; elsewhere it is slim", () => {
    expect(NORMAL.timerHead).toBe(48);
    expect(NORMAL.timerSlim).toBeLessThan(NORMAL.timerHead);
  });
  it("the selected score is the only large number: bigger than every other size on the screen", () => {
    for (const k of ["body", "small", "name", "digit", "heading", "timerSlim", "composed"] as const) expect(NORMAL.readout).toBeGreaterThan(NORMAL[k]);
  });
  it("buttons are never smaller than a pad button's height", () => expect(NORMAL.tap).toBeLessThanOrEqual(NORMAL.padHeight));
});

describe("Large is what Normal was before round 4", () => {
  it("pad buttons 46 with 6 px gaps, digits 19, rider names 17, the selected score 30, buttons 44", () => {
    expect([LARGE.padHeight, LARGE.padGap, LARGE.digit, LARGE.name, LARGE.readout, LARGE.tap]).toEqual([46, 6, 19, 17, 30, 44]);
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
