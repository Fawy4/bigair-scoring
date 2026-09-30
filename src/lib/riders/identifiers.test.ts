import { describe, expect, it } from "vitest";
import { cleanIdentifiers, withIdentifier } from "./identifiers";

describe("identifiers", () => {
  it("drops empty values and unknown keys, trims text, keeps numbers as text", () => {
    expect(cleanIdentifiers({ vest_colour: " red ", bib: 14, kite: { brand: "", model: " Orbit ", size: 9 }, hacker: 1, helmet_colour: "" })).toEqual({ vest_colour: "red", bib: "14", kite: { model: "Orbit", size: "9" } });
  });
  it("copes with nothing at all", () => {
    expect(cleanIdentifiers(null)).toEqual({});
    expect(cleanIdentifiers("x")).toEqual({});
  });
  it("changing one cell leaves the others alone, and clearing it removes it", () => {
    const a = withIdentifier({ vest_colour: "red", kite: { brand: "North" } }, "kiteModel", "Orbit");
    expect(a).toEqual({ vest_colour: "red", kite: { brand: "North", model: "Orbit" } });
    expect(withIdentifier(a, "kiteBrand", "")).toEqual({ vest_colour: "red", kite: { model: "Orbit" } });
    expect(withIdentifier(a, "vest_colour", "")).toEqual({ kite: { brand: "North", model: "Orbit" } });
  });
});
