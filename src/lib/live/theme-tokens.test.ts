import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { builtInSchemes } from "@/lib/schemas/identification";
import { inkFor } from "@/lib/identification/rider-label";
import { BEACH_THEMES, contrastRatio, NAMEPLATE, TEXT_PAIRS, type BeachTokens } from "./theme-tokens";

// docs/06 §00.1: contrast of at least 7:1 for essential text and numbers, in the daylight and the dark theme; no light-grey text.
const MIN = 7;
const themes = Object.entries(BEACH_THEMES) as Array<[string, BeachTokens]>;

describe("contrast maths", () => {
  it("black on white is 21:1 and the order of the two colours does not matter", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });
  it("the same colour is 1:1", () => expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5));
  it("a known mid pair: #767676 on white is 4.54:1 (the classic AA grey)", () => expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2));
});

describe.each(themes)("%s theme tokens", (_name, t) => {
  it("every text colour reads at 7:1 or better on the colour it sits on", () => {
    const failures = TEXT_PAIRS.map(([fg, bg]) => ({ fg, bg, ratio: contrastRatio(t[fg], t[bg]) })).filter((p) => p.ratio < MIN);
    expect(failures).toEqual([]);
  });
  it("has all thirteen named tokens", () => {
    for (const key of ["bg", "surface", "ink", "muted", "border", "focus", "live", "pending", "failed", "crash", "outlier", "missing", "selected"] as const) {
      expect(t[key]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
  it("borders and the focus ring stand out from the page by 7:1 too", () => {
    expect(contrastRatio(t.border, t.bg)).toBeGreaterThanOrEqual(MIN);
    expect(contrastRatio(t.focus, t.bg)).toBeGreaterThanOrEqual(MIN);
    expect(contrastRatio(t.focus, t.surface)).toBeGreaterThanOrEqual(MIN);
  });
  it("no light-grey text: muted ink is at least as strong as 7:1 on both backgrounds", () => {
    expect(contrastRatio(t.muted, t.bg)).toBeGreaterThanOrEqual(MIN);
    expect(contrastRatio(t.muted, t.surface)).toBeGreaterThanOrEqual(MIN);
  });
});

describe("the two themes differ", () => {
  it("daylight is dark text on light; dark is light text on dark", () => {
    expect(contrastRatio(BEACH_THEMES.day.bg, "#ffffff")).toBeLessThan(1.2);
    expect(contrastRatio(BEACH_THEMES.dark.bg, "#000000")).toBeLessThan(1.3);
  });
});

describe("globals.css carries exactly these values", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const block = (cls: string) => {
    const m = css.match(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`));
    expect(m, `${cls} block`).not.toBeNull();
    return m![1];
  };
  it.each([
    ["beach-day", BEACH_THEMES.day],
    ["beach-dark", BEACH_THEMES.dark],
  ] as const)("%s", (cls, t) => {
    const body = block(cls);
    for (const [key, hex] of Object.entries(t)) {
      const cssName = `--beach-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
      expect(body, `${cls} ${cssName}`).toContain(`${cssName}: ${hex};`);
    }
  });
});

describe("lycra colours in both themes (inkFor, outlined white and black)", () => {
  const palette = builtInSchemes()[0].palette;
  it("the plate that carries the colour name is 7:1 in both themes, whatever the lycra colour", () => {
    for (const c of palette) {
      expect(contrastRatio(NAMEPLATE.ink, NAMEPLATE.bg), c.label).toBeGreaterThanOrEqual(MIN);
    }
  });
  it("without the plate, most lycra colours cannot reach 7:1 for text printed on them (why the plate exists)", () => {
    const below = palette.filter((c) => contrastRatio(inkFor(c.hex), c.hex) < MIN).map((c) => c.label);
    expect(below).toEqual(expect.arrayContaining(["Red", "Blue", "Green", "Orange", "Pink", "Purple", "Grey"]));
  });
  it("the label's own frame is the page ink in the dark theme, so a black lycra is still outlined against a dark page", () => {
    expect(contrastRatio(BEACH_THEMES.dark.border, BEACH_THEMES.dark.bg)).toBeGreaterThanOrEqual(MIN);
    // the label body is white in both themes: black lycra (#111111 / #000000) sits on white, white lycra gets the black inset outline
    const black = palette.find((c) => c.label === "Black")!;
    const white = palette.find((c) => c.label === "White")!;
    expect(contrastRatio(black.hex, "#ffffff")).toBeGreaterThanOrEqual(MIN);
    expect(inkFor(black.hex)).toBe("#ffffff");
    expect(inkFor(white.hex)).toBe("#111111");
  });
  it("the dark rule for the label frame exists in globals.css", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/\.beach-dark\s+\[data-testid="rider-label"\]/);
  });
});
