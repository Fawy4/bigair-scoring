import { describe, expect, it } from "vitest";
import { builtInSchemes } from "@/lib/schemas/identification";
import { labelStyleFor, bestInk } from "./label-style";
import { contrastRatio } from "@/lib/live/theme-tokens";

// The Rider label picks its own look from the identification scheme (owner, round 3): no manual switch.
const style = (id: string) => labelStyleFor(builtInSchemes().find((s) => s.id === id)!);

describe("Rider label style follows the scheme", () => {
  it("Lycra schemes (per heat or fixed) and brand-launch: a coloured block with the colour word", () => {
    expect(style("vests-per-heat")).toBe("colour-block");
    expect(style("fixed-lycra-per-rider")).toBe("colour-block");
    expect(style("brand-launch-same-kites")).toBe("colour-block");
  });
  it("bib numbers: a number block", () => expect(style("bib-numbers")).toBe("number-block"));
  it("name call-out: name first, no block", () => expect(style("name-callout")).toBe("name-first"));
  it("kites with no Lycras: a text block with the kite", () => expect(style("kites-no-vests")).toBe("number-block"));
  it("a rash guard or helmet colour as the main identifier is a coloured block too", () => {
    const base = builtInSchemes()[0];
    expect(labelStyleFor({ ...base, primary: "rashguard_colour" })).toBe("colour-block");
    expect(labelStyleFor({ ...base, primary: "helmet_colour" })).toBe("colour-block");
    expect(labelStyleFor({ ...base, primary: "photo" })).toBe("name-first");
  });
});

describe("the word on a coloured block uses whichever of black or white reads better", () => {
  const palette = builtInSchemes()[0].palette;
  it("every Lycra colour reaches at least 4.5:1 (WCAG AA)", () => {
    for (const c of palette) expect(contrastRatio(bestInk(c.hex), c.hex), c.label).toBeGreaterThanOrEqual(4.5);
  });
  it("yellow and green take dark ink, red and blue take white", () => {
    const hex = (l: string) => palette.find((c) => c.label === l)!.hex;
    expect(bestInk(hex("Yellow"))).toBe("#111111");
    expect(bestInk(hex("Green"))).toBe("#111111");
    expect(bestInk(hex("Red"))).toBe("#ffffff");
    expect(bestInk(hex("Blue"))).toBe("#ffffff");
  });
});
