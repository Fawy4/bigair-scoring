import { describe, expect, it } from "vitest";
import { builtInSchemes } from "@/lib/schemas/identification";
import { chipModel, type ChipRider } from "./chip";

const scheme = (id: string) => builtInSchemes().find((s) => s.id === id)!;
const rider: ChipRider = {
  name: "Sam Sample",
  nationality: "EG",
  slotColour: "red",
  identifiers: { vest_colour: "blue", bib: 14, kite: { brand: "North", model: "Orbit", size: 9, colours: "blue/white" }, rashguard_colour: "green" },
};

describe("rider chip", () => {
  it("vests per heat: the slot colour wins and is always written as text", () => {
    const c = chipModel(scheme("vests-per-heat"), rider);
    expect(c.primary).toMatchObject({ kind: "colour", text: "RED", hex: "#e11d48", ink: "#ffffff", outlined: false });
    expect(c.secondary.map((s) => s.text)).toEqual(["Sam Sample", "EG"]);
    expect(c.callout).toBe("Red");
  });

  it("fixed lycra: the rider's own colour wins over the slot", () => {
    const c = chipModel(scheme("fixed-lycra-per-rider"), rider);
    expect(c.primary.text).toBe("BLUE");
    expect(c.secondary.map((s) => s.text)).toEqual(["Sam Sample", "#14"]);
  });

  it("white and black vests are outlined, with dark or light text", () => {
    const white = chipModel(scheme("vests-per-heat"), { ...rider, slotColour: "white" }).primary;
    expect(white).toMatchObject({ text: "WHITE", outlined: true, ink: "#111111" });
    const black = chipModel(scheme("vests-per-heat"), { ...rider, slotColour: "black" }).primary;
    expect(black).toMatchObject({ text: "BLACK", outlined: true, ink: "#ffffff" });
  });

  it("bib numbers and their call-out", () => {
    const c = chipModel(scheme("bib-numbers"), rider);
    expect(c.primary).toMatchObject({ kind: "text", text: "14" });
    expect(c.callout).toBe("14");
    expect(c.secondary.map((s) => s.text)).toContain("North Orbit 9 · blue/white");
  });

  it("kite as the primary identifier, called out as colour + model", () => {
    const c = chipModel(scheme("kites-no-vests"), rider);
    expect(c.primary.text).toBe("North Orbit 9 · blue/white");
    expect(c.callout).toBe("blue Orbit");
    expect(c.secondary.map((s) => s.text)).toContain("Rash guard: Green");
  });

  it("brand launch: no vest yet → rash guard colour is used and marked as the fallback", () => {
    const c = chipModel(scheme("brand-launch-same-kites"), { ...rider, slotColour: null, identifiers: { ...rider.identifiers, vest_colour: undefined } });
    expect(c.primary).toMatchObject({ text: "GREEN", usedFallback: true });
    expect(c.secondary.map((s) => s.text)).toContain("9 m · blue/white");
  });

  it("nothing known → says so instead of guessing", () => {
    const c = chipModel(scheme("bib-numbers"), { name: "Nobody" });
    expect(c.primary).toMatchObject({ kind: "none", text: "NOT SET" });
  });
});
