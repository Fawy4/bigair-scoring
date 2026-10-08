import { describe, expect, it } from "vitest";
import { expandFormat } from "@/lib/engine/ladder";
import { loadFormat, makeEntrants } from "@/lib/engine/ladder/fixtures";
import { builtInSchemes, type IdentificationScheme } from "@/lib/schemas/identification";
import { biggestHeat, colourKeys, coloursRefusal, recolour } from "./seat-colours";

const base = builtInSchemes().find((s) => s.id === "vests-per-heat")!;
const keep = (keys: string[]): IdentificationScheme => ({ ...base, palette: keys.map((k) => base.palette.find((c) => c.key === k)!) });
const tpl = () => loadFormat("heats4-top2-single-elim", (j) => Object.assign(j.generator.params, { heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2 }));

describe("the event's list on the draw", () => {
  it("is the palette keys in the organiser's order", () => {
    expect(colourKeys(keep(["red", "black", "white"]))).toEqual(["red", "black", "white"]);
  });

  it("a list of 2 colours with heats of 3 is refused with a plain sentence", () => {
    const draw = expandFormat(tpl(), makeEntrants(12), { identification: "vests-per-heat", vestColours: ["red", "black"] });
    expect(biggestHeat(draw)).toBe(3);
    expect(coloursRefusal(keep(["red", "black"]), 3)).toBe("Heats here have up to 3 riders — keep at least 3 colours.");
  });

  it("3 colours are enough; a scheme without per-heat lycras is never refused", () => {
    expect(coloursRefusal(keep(["red", "black", "white"]), 3)).toBeNull();
    expect(coloursRefusal({ ...base, vestAssignment: "none", primary: "name" }, 3)).toBeNull();
  });

  it("recolour re-deals an older draw (built-in colours) to the event's list, leaving started heats alone", () => {
    const old = expandFormat(tpl(), makeEntrants(12), { identification: "vests-per-heat" });
    old.rounds[0].heats[1].status = "running";
    const fresh = recolour(old, ["red", "black", "white"]);
    expect(fresh.rounds[0].heats[0].slots.map((s) => s.vestColour)).toEqual(["red", "black", "white"]);
    expect(fresh.rounds[0].heats[1].slots.map((s) => s.vestColour)).toEqual(["red", "yellow", "blue"]);
    expect(fresh.overrides.vestColours).toEqual(["red", "black", "white"]);
  });
});
