import { describe, expect, it } from "vitest";
import { BEACH_THEMES, contrastRatio } from "./theme-tokens";

// The "Needs your score" tag on the judge's Rider sheet: ink on a 9% wash of the app's teal over the page colour, and the tag's border and the line's bar in teal. Its words
// meet the beach standard (7:1 on essential text) in Daylight and in Dark; the teal bar and the glow read against the page at 3:1 or better (they are never the only sign: the words
// are there too).
const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a: string, b: string, share: number): string => {
  const [x, y] = [hex(a), hex(b)];
  return "#" + x.map((v, i) => Math.round(v * share + y[i] * (1 - share)).toString(16).padStart(2, "0")).join("");
};

describe("the Needs your score tag in both themes", () => {
  for (const [name, t] of Object.entries(BEACH_THEMES)) {
    it(`${name}: the tag's words are at least 7:1 on the tag, the tag's wash and the bar are visible against the page`, () => {
      const wash = mix(t.accent, t.bg, 0.09);
      expect(contrastRatio(t.ink, wash)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(t.ink, t.bg)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(t.accent, t.bg)).toBeGreaterThanOrEqual(3);
    });
  }
});
