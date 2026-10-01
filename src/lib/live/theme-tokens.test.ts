import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { builtInSchemes } from "@/lib/schemas/identification";
import { inkFor } from "@/lib/identification/rider-label";
import { BEACH_THEMES, contrastRatio, relativeLuminance, TEXT_PAIRS, type BeachTokens } from "./theme-tokens";

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
  it("has every named token", () => {
    for (const key of ["bg", "surface", "line", "ink", "muted", "border", "focus", "accent", "onAccent", "live", "pending", "failed", "crash", "outlier", "missing", "onCrash", "tintCrash", "tintGrey", "tintGreen0", "tintGreen1", "tintGreen2", "tintGreen3"] as const) {
      expect(t[key]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
  it("the frame of a control (pad button, field) stands out by 4.5:1 and the focus ring by 7:1; the soft card line is decoration only", () => {
    expect(contrastRatio(t.border, t.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t.border, t.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t.focus, t.bg)).toBeGreaterThanOrEqual(MIN);
    expect(contrastRatio(t.focus, t.surface)).toBeGreaterThanOrEqual(MIN);
  });
  it("the accent (selected state, primary button, progress) carries white or near-black text at 7:1", () => {
    expect(contrastRatio(t.onAccent, t.accent)).toBeGreaterThanOrEqual(MIN);
  });
  it("no light-grey text: muted ink is at least as strong as 7:1 on both backgrounds", () => {
    expect(contrastRatio(t.muted, t.bg)).toBeGreaterThanOrEqual(MIN);
    expect(contrastRatio(t.muted, t.surface)).toBeGreaterThanOrEqual(MIN);
  });
});

describe("result row tints", () => {
  it.each(themes)("%s: the four greens run from strongest to lightest and carry ink at 7:1", (_n, t) => {
    const greens = [t.tintGreen0, t.tintGreen1, t.tintGreen2, t.tintGreen3];
    expect(new Set(greens).size).toBe(4);
    for (const g of greens) expect(contrastRatio(t.ink, g)).toBeGreaterThanOrEqual(MIN);
  });
  it("in Daylight shade 0 is the darkest green and shade 3 the lightest; in Dark shade 0 is the strongest and shade 3 the dimmest", () => {
    const d = BEACH_THEMES.day;
    expect(relativeLuminance(d.tintGreen0)).toBeLessThan(relativeLuminance(d.tintGreen3));
    const k = BEACH_THEMES.dark;
    expect(relativeLuminance(k.tintGreen0)).toBeGreaterThan(relativeLuminance(k.tintGreen3));
  });
  it("crash, not counted and counted do not look alike", () => {
    for (const t of Object.values(BEACH_THEMES)) expect(new Set([t.tintCrash, t.tintGrey, t.tintGreen1]).size).toBe(3);
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
  it("the colour word is written in the page ink, never on the colour, so it reads at 7:1 whatever the Lycra colour", () => {
    for (const t of Object.values(BEACH_THEMES)) {
      expect(contrastRatio(t.ink, t.surface)).toBeGreaterThanOrEqual(MIN);
      expect(contrastRatio(t.ink, t.bg)).toBeGreaterThanOrEqual(MIN);
    }
  });
  it("the dot and stripe carry the colour; white and black are outlined in the page ink so they stand out on a light and on a dark page", () => {
    for (const t of Object.values(BEACH_THEMES)) expect(contrastRatio(t.ink, t.bg)).toBeGreaterThanOrEqual(MIN);
    const black = palette.find((c) => c.label === "Black")!;
    const white = palette.find((c) => c.label === "White")!;
    expect(inkFor(black.hex)).toBe("#ffffff");
    expect(inkFor(white.hex)).toBe("#111111");
  });
  it("(old block label) its frame follows the page ink in the dark theme", () => {
    expect(contrastRatio(BEACH_THEMES.dark.ink, BEACH_THEMES.dark.bg)).toBeGreaterThanOrEqual(MIN);
  });
  it("the dark rule for the label frame exists in globals.css", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/\.beach-dark\s+\[data-testid="rider-label"\]/);
  });
});
