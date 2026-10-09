import { describe, expect, it } from "vitest";
import { builtInSchemes } from "@/lib/schemas/identification";
import { riderLabelModel, type LabelRider } from "./rider-label";

const scheme = (id: string) => builtInSchemes().find((s) => s.id === id)!;
const rider: LabelRider = {
  name: "Sam Sample",
  nationality: "EG",
  slotColour: "red",
  identifiers: { vest_colour: "blue", bib: 14, kite: { brand: "North", model: "Orbit", size: 9, colours: "blue/white" }, rashguard_colour: "green" },
};

describe("rider label", () => {
  it("vests per heat: the slot colour wins and is always written as text", () => {
    const c = riderLabelModel(scheme("vests-per-heat"), rider);
    expect(c.primary).toMatchObject({ kind: "colour", text: "RED", hex: "#e11d48", ink: "#ffffff", outlined: false });
    expect(c.secondary.map((s) => s.text)).toEqual(["Sam Sample", "EG"]);
    expect(c.callout).toBe("Red");
  });

  it("fixed lycra: the rider's own colour wins over the slot", () => {
    const c = riderLabelModel(scheme("fixed-lycra-per-rider"), rider);
    expect(c.primary.text).toBe("BLUE");
    expect(c.secondary.map((s) => s.text)).toEqual(["Sam Sample", "#14"]);
  });

  it("white and black vests are outlined, with dark or light text", () => {
    const white = riderLabelModel(scheme("vests-per-heat"), { ...rider, slotColour: "white" }).primary;
    expect(white).toMatchObject({ text: "WHITE", outlined: true, ink: "#111111" });
    const black = riderLabelModel(scheme("vests-per-heat"), { ...rider, slotColour: "black" }).primary;
    expect(black).toMatchObject({ text: "BLACK", outlined: true, ink: "#ffffff" });
  });

  it("bib numbers and their call-out", () => {
    const c = riderLabelModel(scheme("bib-numbers"), rider);
    expect(c.primary).toMatchObject({ kind: "text", text: "14" });
    expect(c.callout).toBe("14");
    expect(c.secondary.map((s) => s.text)).toContain("North Orbit 9 · blue/white");
  });

  it("kite as the primary identifier, called out as colour + model", () => {
    const c = riderLabelModel(scheme("kites-no-vests"), rider);
    expect(c.primary.text).toBe("North Orbit 9 · blue/white");
    expect(c.callout).toBe("blue Orbit");
    expect(c.secondary.map((s) => s.text)).toContain("Rash guard: Green");
  });

  it("brand launch: no vest yet → rash guard colour is used and marked as the fallback", () => {
    const c = riderLabelModel(scheme("brand-launch-same-kites"), { ...rider, slotColour: null, identifiers: { ...rider.identifiers, vest_colour: undefined } });
    expect(c.primary).toMatchObject({ text: "GREEN", usedFallback: true });
    expect(c.secondary.map((s) => s.text)).toContain("9 m · blue/white");
  });

  it("nothing known → says so instead of guessing", () => {
    const c = riderLabelModel(scheme("bib-numbers"), { name: "Nobody" });
    expect(c.primary).toMatchObject({ kind: "none", text: "NOT SET" });
  });
});

describe("rider label: name call-out", () => {
  it("the name is the big text and the call-out; no lycra or number needed", () => {
    const c = riderLabelModel(scheme("name-callout"), { name: "Sam Sample", nationality: "EG", sponsor: "Sample Co." });
    expect(c.primary).toMatchObject({ kind: "text", text: "Sam Sample", outlined: true });
    expect(c.callout).toBe("Sam Sample");
    expect(c.secondary.map((x) => x.text)).toEqual(["EG", "Sample Co."]);
  });
});

describe("a colour that is not on the event's list", () => {
  it("never takes the rider's name away: NOT SET is a block beside the name", () => {
    const scheme = builtInSchemes().find((s) => s.id === "vests-per-heat")!;
    const m = riderLabelModel({ ...scheme, palette: scheme.palette.filter((c) => ["red", "black", "white"].includes(c.key)) }, { name: "Robert Ghitulescu", slotColour: "yellow" });
    expect(m.primary.text).toBe("NOT SET");
    expect(m.primary.source).toBe("vest_colour");
    expect(m.name).toBe("Robert Ghitulescu");
  });
});
