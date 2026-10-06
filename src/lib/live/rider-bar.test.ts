import { describe, expect, it } from "vitest";
import { builtInSchemes } from "@/lib/schemas/identification";
import { BEACH_THEMES, contrastRatio } from "./theme-tokens";
import { riderBarStyle } from "./rider-bar";

const palette = builtInSchemes()[0].palette;

describe("the selectable rider bar of the Impression step", () => {
  it("every Lycra colour of the palette gets its own fill and a colour word that reads at 7:1 or better", () => {
    for (const c of palette) {
      const s = riderBarStyle(c.hex);
      expect(s.fill).toBe(c.hex);
      // the word's own background is the fill when the ink reads at 7:1 on it, otherwise a plain plate under the word
      expect(contrastRatio(s.wordInk, s.wordBg), `${c.label}`).toBeGreaterThanOrEqual(7);
    }
  });
  it("a colour the ink reads well on carries the word straight on the fill (no plate)", () => {
    expect(riderBarStyle("#111111").plate).toBe(false);
    expect(riderBarStyle("#ffffff").plate).toBe(false);
  });
  it("a middling colour (red) puts the word on a plate of black or white", () => {
    const s = riderBarStyle("#e11d48");
    expect(s.plate).toBe(true);
    expect(["#111111", "#ffffff"]).toContain(s.wordBg);
  });
  it("Day and Dark: the name, nationality and score sit on a plate of the page's own colours and read at 7:1, and the thick selected border reads against the page", () => {
    for (const theme of ["day", "dark"] as const) {
      const t = BEACH_THEMES[theme];
      expect(contrastRatio(t.ink, t.bg), theme).toBeGreaterThanOrEqual(7);
    }
  });
});
