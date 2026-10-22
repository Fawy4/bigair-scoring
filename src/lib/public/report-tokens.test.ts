import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/live/theme-tokens";

// Rider report colours (RA1, item 8): the owner's palette, and 4.5:1 for every pair a word is set in. The numbers are read from the stylesheet itself.
const css = readFileSync("src/app/report.css", "utf8");
const block = (selector: string): Record<string, string> => {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("}", start));
  const out: Record<string, string> = {};
  for (const [, k, v] of body.matchAll(/--(r-[a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)) out[k] = v.toLowerCase();
  return out;
};
const day = block(".report");
const dark = block('.report[data-theme="dark"]');

const SPEC = {
  day: { "r-bg": "#ffffff", "r-tint": "#fff1e6", "r-soft": "#fff0e5", "r-card": "#ffffff", "r-edge": "#d3dedf", "r-text": "#111111", "r-muted": "#475659", "r-accent": "#ba4800", "r-on-accent": "#ffffff", "r-accent-soft": "#fff0e5", "r-crash": "#b42318", "r-crash-bg": "#fcebe9", "r-grey": "#8c9a9c", "r-f1": "#ba4800", "r-f2": "#ff6a00", "r-f3": "#fdba74", "r-f4": "#99a9ab", "r-f5": "#d3dedf" },
  dark: { "r-bg": "#000000", "r-tint": "#160a03", "r-soft": "#1a0c03", "r-card": "#111111", "r-edge": "#2a3335", "r-text": "#ffffff", "r-muted": "#b0b0b0", "r-accent": "#ff6a00", "r-on-accent": "#000000", "r-accent-soft": "#2a1405", "r-crash": "#ff6b6b", "r-crash-bg": "#2a1212", "r-grey": "#6b7a7c", "r-f1": "#ff8a3d", "r-f2": "#ff6a00", "r-f3": "#9a3b00", "r-f4": "#56666a", "r-f5": "#2a3335" },
};

describe("report colours", () => {
  it("are exactly the owner's palette in Day and in Dark", () => {
    expect(day).toEqual(SPEC.day);
    expect(dark).toEqual(SPEC.dark);
  });
  for (const [name, t] of [["Day", day], ["Dark", dark]] as const) {
    it(`${name}: every pair a word is set in has at least 4.5:1`, () => {
      const pairs: Array<[string, string]> = [
        ["r-text", "r-bg"], ["r-text", "r-card"], ["r-text", "r-soft"], ["r-text", "r-tint"], ["r-text", "r-accent-soft"],
        ["r-muted", "r-bg"], ["r-muted", "r-card"], ["r-muted", "r-soft"], ["r-muted", "r-tint"],
        ["r-accent", "r-bg"], ["r-accent", "r-card"], ["r-accent", "r-accent-soft"], ["r-accent", "r-soft"], ["r-accent", "r-tint"],
        ["r-on-accent", "r-accent"], ["r-crash", "r-crash-bg"],
      ];
      for (const [fg, bg] of pairs) expect(contrastRatio(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    });
  }
});
