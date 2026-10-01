import { describe, expect, it } from "vitest";
import { matchesSearch, normaliseForSearch } from "./search";

describe("table search", () => {
  it("ignores case and accents: 'jose' finds 'José Núñez'", () => {
    expect(normaliseForSearch("José Núñez")).toBe("jose nunez");
    expect(matchesSearch("José Núñez", "jose")).toBe(true);
    expect(matchesSearch("José Núñez", "NUNEZ")).toBe(true);
  });
  it("an empty search matches everything", () => {
    expect(matchesSearch("anything", "")).toBe(true);
    expect(matchesSearch("anything", "   ")).toBe(true);
  });
  it("every word must be found, in any order, in any part of the row", () => {
    expect(matchesSearch("Luca Moretti IT Pro Men", "ma pro")).toBe(false);
    expect(matchesSearch("Mateo Silva BR Pro Men", "ma pro")).toBe(true);
    expect(matchesSearch("Mateo Silva BR Pro Men", "men mateo")).toBe(true);
  });
  it("a word that is not there finds nothing", () => expect(matchesSearch("Luca Moretti", "zzz")).toBe(false));
});
