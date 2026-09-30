import { describe, expect, it } from "vitest";
import { builtInSchemes, type IdentificationScheme } from "@/lib/schemas/identification";
import { findClashes, kitesAlike, type ClashRider } from "./duplicates";

const scheme = (id: string): IdentificationScheme => builtInSchemes().find((s) => s.id === id)!;
const r = (id: string, name: string, identifiers: ClashRider["identifiers"] = {}): ClashRider => ({ id, name, identifiers });

describe("findClashes", () => {
  it("fixed lycra: two riders with the same colour clash, different colours do not", () => {
    const s = scheme("fixed-lycra-per-rider");
    const clashes = findClashes(s, [r("1", "Ana", { vest_colour: "red" }), r("2", "Ben", { vest_colour: "red" }), r("3", "Cy", { vest_colour: "blue" })]);
    expect(clashes).toHaveLength(1);
    expect(clashes[0]).toMatchObject({ kind: "lycra", riderIds: ["1", "2"] });
    expect(clashes[0].message).toMatch(/Red/);
    expect(clashes[0].message).toMatch(/Ana/);
    expect(clashes[0].message).toMatch(/Ben/);
  });
  it("lycra per heat: colours change every heat, so no warning", () => {
    expect(findClashes(scheme("vests-per-heat"), [r("1", "Ana", { vest_colour: "red" }), r("2", "Ben", { vest_colour: "red" })])).toEqual([]);
  });
  it("bib numbers: the same bib clashes, compared as text without leading zeros", () => {
    const s = scheme("bib-numbers");
    const c = findClashes(s, [r("1", "Ana", { bib: "014" }), r("2", "Ben", { bib: 14 }), r("3", "Cy", { bib: "15" })]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: "bib", riderIds: ["1", "2"] });
  });
  it("a missing bib is not a clash", () => {
    expect(findClashes(scheme("bib-numbers"), [r("1", "Ana"), r("2", "Ben")])).toEqual([]);
  });
  it("kite scheme: near-identical kites clash", () => {
    const s = scheme("kites-no-vests");
    const k = (size: string, colours: string) => ({ kite: { brand: "North", model: "Orbit", size, colours } });
    const c = findClashes(s, [r("1", "Ana", k("9", "blue/white")), r("2", "Ben", k("9.0", "White / Blue")), r("3", "Cy", k("12", "blue/white"))]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: "kite", riderIds: ["1", "2"] });
  });
  it("rash guard colour as a primary identifier clashes on the same colour", () => {
    const s: IdentificationScheme = { ...scheme("kites-no-vests"), primary: "rashguard_colour" };
    expect(findClashes(s, [r("1", "Ana", { rashguard_colour: "red" }), r("2", "Ben", { rashguard_colour: "red" })])).toHaveLength(1);
  });
  it("name call-out: two riders with the same name clash (the spotter could not tell them apart)", () => {
    const c = findClashes(scheme("name-callout"), [r("1", "Sam Smith"), r("2", " sam  smith "), r("3", "Sam Jones")]);
    expect(c).toHaveLength(1);
    expect(c[0].kind).toBe("name");
  });
  it("three riders sharing a bib give one clash naming all three", () => {
    const c = findClashes(scheme("bib-numbers"), [r("1", "A", { bib: 1 }), r("2", "B", { bib: 1 }), r("3", "C", { bib: 1 })]);
    expect(c).toHaveLength(1);
    expect(c[0].riderIds).toEqual(["1", "2", "3"]);
  });
  it("withdrawn riders are the caller's business: only the riders passed in are compared", () => {
    expect(findClashes(scheme("bib-numbers"), [r("1", "A", { bib: 1 })])).toEqual([]);
  });
});

describe("kitesAlike", () => {
  const k = (brand: string, model: string, size: string, colours: string) => ({ brand, model, size, colours });
  it("same brand, model, size and colours in another order: alike", () => expect(kitesAlike(k("North", "Orbit", "9", "blue/white"), k("north", "ORBIT", "9", "white-blue"))).toBe(true));
  it("half a metre apart is still alike", () => expect(kitesAlike(k("North", "Orbit", "9", "blue"), k("North", "Orbit", "9.5", "blue"))).toBe(true));
  it("a whole size apart is different", () => expect(kitesAlike(k("North", "Orbit", "9", "blue"), k("North", "Orbit", "10", "blue"))).toBe(false));
  it("another model is different", () => expect(kitesAlike(k("North", "Orbit", "9", "blue"), k("North", "Reach", "9", "blue"))).toBe(false));
  it("different colours are different", () => expect(kitesAlike(k("North", "Orbit", "9", "blue"), k("North", "Orbit", "9", "red"))).toBe(false));
  it("a kite with nothing entered is never alike", () => expect(kitesAlike({}, {})).toBe(false));
});
