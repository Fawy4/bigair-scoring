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
    for (const key of ["bg", "surface", "line", "ink", "muted", "border", "fill", "key", "hint", "focus", "accent", "onAccent", "accentText", "selected", "onSelected", "attention", "onAttention", "board", "onBoard", "boardMuted", "live", "pending", "failed", "crash", "outlier", "missing", "onCrash", "tintCrash", "tintGrey", "tintGrade0", "tintGrade1", "tintGrade2", "tintGrade3", "tintGrade4", "tintDist0", "tintDist1", "tintDist2", "tintDist3"] as const) {
      expect(t[key]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
  it("the thin edge of a control is decoration (its words carry it) and the focus ring stands out by 7:1", () => {
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

// The brand (the same as the Instagram posts): near-black #111111, white #FFFFFF, grey #B0B0B0, the Sendbook orange #FF6A00 (kept for "Needs your score" and the logo only) and teal for everything else.
describe("teal is the accent; orange is kept for 'Needs your score'", () => {
  const ORANGE = "#ff6a00";
  it("every button, selected state and focus ring is teal: the accent, the selected colour and the accent text are the same teal in each theme", () => {
    for (const t of Object.values(BEACH_THEMES)) {
      expect(t.selected).toBe(t.accent);
      expect(t.onSelected).toBe(t.onAccent);
      expect(t.accentText).toBe(t.accent);
      expect(t.accent).not.toBe(ORANGE);
    }
    expect(BEACH_THEMES.day.accent).toBe("#0f5c57");
    expect(BEACH_THEMES.dark.accent).toBe("#5fd3c6");
  });
  it("teal with its text passes 7:1 in both themes (white on #0F5C57 in Day, #04211E on #5FD3C6 in Dark), and teal text reads at 7:1 on the page", () => {
    for (const t of Object.values(BEACH_THEMES)) {
      expect(contrastRatio(t.onAccent, t.accent)).toBeGreaterThanOrEqual(MIN);
      expect(contrastRatio(t.accentText, t.bg)).toBeGreaterThanOrEqual(MIN);
      expect(contrastRatio(t.focus, t.bg)).toBeGreaterThanOrEqual(MIN);
      expect(contrastRatio(t.accent, t.bg)).toBeGreaterThanOrEqual(3);
    }
  });
  it("orange is #FF6A00 in both themes, carries black text at 7.31:1, and is never text on white (2.87:1)", () => {
    for (const t of Object.values(BEACH_THEMES)) {
      expect(t.attention).toBe(ORANGE);
      expect(t.onAttention).toBe("#000000");
    }
    expect(contrastRatio("#000000", ORANGE)).toBeCloseTo(7.31, 2);
    expect(contrastRatio("#ffffff", ORANGE)).toBeCloseTo(2.87, 2);
    expect(contrastRatio(ORANGE, "#000000")).toBeCloseTo(7.31, 2);
  });
  it("orange is used for nothing but 'Needs your score' (and the logo): no component outside the Rider sheet line uses the attention colour", () => {
    const { readdirSync, readFileSync: rf, statSync } = require("node:fs") as typeof import("node:fs");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = `${dir}/${f}`;
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx|ts)$/.test(f) && !/\.test\./.test(f) && /beach-(on-)?attention/.test(rf(p, "utf8"))) hits.push(p);
      }
    };
    walk("src");
    expect(hits).toEqual(["src/components/live/rider-sheet.tsx"]);
  });
  it("the Dark crash is a vivid red #FF6B6B that carries black at 7:1 or better (7.6:1)", () => {
    expect(BEACH_THEMES.dark.crash).toBe("#ff6b6b");
    expect(contrastRatio("#000000", "#ff6b6b")).toBeCloseTo(7.6, 1);
  });
  it("the scoreboard bar is the brand near-black with white (and brand grey) text in both themes", () => {
    for (const t of Object.values(BEACH_THEMES)) {
      expect(t.board).toBe("#111111");
      expect(contrastRatio(t.onBoard, t.board)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(t.boardMuted, t.board)).toBeCloseTo(8.71, 2);
    }
  });
  it("a control at rest is white (Day) or near-black (Dark) with a thin edge: never a grey block", () => {
    expect(BEACH_THEMES.day.fill).toBe("#ffffff");
    expect(BEACH_THEMES.dark.fill).toBe("#111111");
    expect(BEACH_THEMES.day.border).toBe("#b0b0b0");
    // the edge is decoration: the words and icon of the button carry it at 7:1
    for (const t of Object.values(BEACH_THEMES)) expect(contrastRatio(t.ink, t.fill)).toBeGreaterThanOrEqual(MIN);
  });
  it("the score pad keys keep their light-grey (Day) and dark-grey (Dark) fill, and the hint in an empty score box is clearly lighter than a real score", () => {
    expect(relativeLuminance(BEACH_THEMES.day.key)).toBeLessThan(relativeLuminance(BEACH_THEMES.day.bg));
    expect(relativeLuminance(BEACH_THEMES.dark.key)).toBeGreaterThan(relativeLuminance(BEACH_THEMES.dark.bg));
    for (const t of Object.values(BEACH_THEMES)) {
      expect(contrastRatio(t.ink, t.key)).toBeGreaterThanOrEqual(MIN);
      expect(contrastRatio(t.hint, t.fill)).toBeLessThan(contrastRatio(t.ink, t.fill) / 3);
      expect(contrastRatio(t.hint, t.fill)).toBeGreaterThan(1.5);
    }
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
