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
    for (const key of ["bg", "surface", "line", "ink", "muted", "border", "fill", "focus", "accent", "onAccent", "accentText", "selected", "onSelected", "board", "onBoard", "boardMuted", "live", "pending", "failed", "crash", "outlier", "missing", "onCrash", "tintCrash", "tintGrey", "tintGrade0", "tintGrade1", "tintGrade2", "tintGrade3", "tintGrade4", "tintDist0", "tintDist1", "tintDist2", "tintDist3"] as const) {
      expect(t[key]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
  it("the hairline of a control (a shape, not text) stands out by 3:1 on the page and the focus ring by 7:1; the soft card line is decoration only", () => {
    expect(contrastRatio(t.border, t.bg)).toBeGreaterThanOrEqual(3);
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

describe("public heat grades and the head judge's distance colours", () => {
  it.each(themes)("%s: five grades and four distance bands, all different, all carrying ink at 7:1", (_n, t) => {
    const grades = [t.tintGrade0, t.tintGrade1, t.tintGrade2, t.tintGrade3, t.tintGrade4];
    const dist = [t.tintDist0, t.tintDist1, t.tintDist2, t.tintDist3];
    expect(new Set(grades).size).toBe(5);
    expect(new Set(dist).size).toBe(4);
    for (const c of [...grades, ...dist]) expect(contrastRatio(t.ink, c)).toBeGreaterThanOrEqual(MIN);
  });
  it("in Daylight grade 0 (yellowest) is lighter than grade 4 (greenest); in Dark it is the other way round, as dark yellow is brighter than dark green", () => {
    const d = BEACH_THEMES.day;
    expect(relativeLuminance(d.tintGrade0)).toBeGreaterThan(relativeLuminance(d.tintGrade4));
  });
  it("crash, not counted and counted do not look alike", () => {
    for (const t of Object.values(BEACH_THEMES)) expect(new Set([t.tintCrash, t.tintGrey, t.tintGrade4]).size).toBe(3);
  });
});

// The brand (the same as the Instagram posts): near-black #111111, electric orange #FF6A00, white #FFFFFF, grey #B0B0B0.
describe("the brand colours and the rules about orange", () => {
  const ORANGE = "#ff6a00";
  it("black on orange is 7.31:1; white on orange only 2.87:1, so orange buttons carry black text", () => {
    expect(contrastRatio("#000000", ORANGE)).toBeCloseTo(7.31, 2);
    expect(contrastRatio("#ffffff", ORANGE)).toBeCloseTo(2.87, 2);
    for (const t of Object.values(BEACH_THEMES)) {
      expect(t.accent).toBe(ORANGE);
      expect(t.onAccent).toBe("#000000");
    }
  });
  it("orange as text: 7.31:1 on #000000, 6.58:1 on #111111, 2.87:1 on white", () => {
    expect(contrastRatio(ORANGE, "#000000")).toBeCloseTo(7.31, 2);
    expect(contrastRatio(ORANGE, "#111111")).toBeCloseTo(6.58, 2);
    expect(contrastRatio(ORANGE, "#ffffff")).toBeCloseTo(2.87, 2);
  });
  it("in Day orange is never text (the accent text is the page ink); in Dark it is orange and the page is #000000, the only ground it is allowed on", () => {
    expect(BEACH_THEMES.day.accentText).toBe(BEACH_THEMES.day.ink);
    expect(BEACH_THEMES.dark.accentText).toBe(ORANGE);
    expect(BEACH_THEMES.dark.bg).toBe("#000000");
    expect(contrastRatio(BEACH_THEMES.dark.accentText, BEACH_THEMES.dark.bg)).toBeGreaterThanOrEqual(MIN);
  });
  it("brand grey #B0B0B0 on #111111 is 8.71:1 and is the Dark muted text", () => {
    expect(contrastRatio("#b0b0b0", "#111111")).toBeCloseTo(8.71, 2);
    expect(BEACH_THEMES.dark.muted).toBe("#b0b0b0");
    expect(BEACH_THEMES.dark.surface).toBe("#111111");
    expect(BEACH_THEMES.day.ink).toBe("#111111");
  });
  it("orange cannot be read as the amber Hold flag: the accent is never one of the flag colours of the preset, and no lycra/amber fill uses it", () => {
    const flagSrc = readFileSync("src/lib/live/flags.ts", "utf8") + readFileSync("src/lib/schemas/flags.ts", "utf8");
    expect(flagSrc.toLowerCase()).not.toContain(ORANGE);
  });
  it("(owner's reading) text inside a box and every other text meets at least 4.5:1 on the grounds used for it, in both themes", () => {
    for (const t of Object.values(BEACH_THEMES)) {
      for (const bg of [t.bg, t.surface]) {
        expect(contrastRatio(t.ink, bg)).toBeGreaterThanOrEqual(MIN);
        expect(contrastRatio(t.muted, bg)).toBeGreaterThanOrEqual(MIN);
        expect(contrastRatio(t.border, t.bg)).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe("teal = selected, and the soft filled controls", () => {
  it("Day teal #115E59 carries white at 7.6:1; Dark teal #2DD4BF carries black at 11.3:1", () => {
    expect(BEACH_THEMES.day.selected).toBe("#115e59");
    expect(contrastRatio("#ffffff", "#115e59")).toBeCloseTo(7.6, 1);
    expect(BEACH_THEMES.dark.selected).toBe("#2dd4bf");
    expect(contrastRatio("#000000", "#2dd4bf")).toBeCloseTo(11.3, 1);
  });
  it("a selected shape stands out from the page by 3:1 in both themes, and from the orange (act now) by its own hue", () => {
    for (const t of Object.values(BEACH_THEMES)) {
      expect(contrastRatio(t.selected, t.bg)).toBeGreaterThanOrEqual(3);
      expect(t.selected).not.toBe(t.accent);
    }
  });
  it("hairlines: about #8C8C8C on white (3.4:1) and #5A5A5A on black (3.0:1)", () => {
    expect(contrastRatio(BEACH_THEMES.day.border, "#ffffff")).toBeCloseTo(3.4, 1);
    expect(contrastRatio(BEACH_THEMES.dark.border, "#000000")).toBeCloseTo(3.0, 1);
  });
  it("Dark crash is a vivid red #FF6B6B that carries black at 7:1 or better (7.6:1)", () => {
    expect(BEACH_THEMES.dark.crash).toBe("#ff6b6b");
    expect(contrastRatio(BEACH_THEMES.dark.onCrash, BEACH_THEMES.dark.crash)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio("#000000", "#ff6b6b")).toBeCloseTo(7.6, 1);
  });
  it("the scoreboard bar is the brand near-black with white (and brand grey) text in both themes", () => {
    for (const t of Object.values(BEACH_THEMES)) {
      expect(t.board).toBe("#111111");
      expect(contrastRatio(t.onBoard, t.board)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(t.boardMuted, t.board)).toBeCloseTo(8.71, 2);
    }
  });
  it("the resting fill is light grey in Day and dark grey in Dark, and differs from the page", () => {
    expect(relativeLuminance(BEACH_THEMES.day.fill)).toBeLessThan(relativeLuminance(BEACH_THEMES.day.bg));
    expect(relativeLuminance(BEACH_THEMES.dark.fill)).toBeGreaterThan(relativeLuminance(BEACH_THEMES.dark.bg));
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
