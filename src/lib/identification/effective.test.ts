import { describe, expect, it } from "vitest";
import { builtInSchemes, type IdentificationScheme } from "@/lib/schemas/identification";
import { copy } from "@/lib/ui-copy";
import { effectiveScheme, tableLabel } from "./effective";
import type { LabelRider } from "./rider-label";

const schemes = builtInSchemes();
const s = (id: string) => schemes.find((x) => x.id === id)!;
const full: LabelRider = {
  name: "Sam Sample",
  nationality: "EG",
  sponsor: "Acme",
  photoUrl: "https://x.test/p.jpg",
  identifiers: { vest_colour: "red", bib: 14, kite: { brand: "North", model: "Orbit", size: 9, colours: "blue/white" }, rashguard_colour: "green", helmet_colour: "black" },
};

describe("the division's effective scheme", () => {
  const event = { scheme: s("name-callout"), allowDivisionOverride: true };
  it("uses the event's scheme by default", () => {
    expect(effectiveScheme(event, null).id).toBe("name-callout");
  });
  it("uses the division's own scheme when the event allows it", () => {
    expect(effectiveScheme(event, { scheme: s("bib-numbers") }).id).toBe("bib-numbers");
  });
  it("ignores a stored division scheme while the event's override switch is off", () => {
    expect(effectiveScheme({ ...event, allowDivisionOverride: false }, { scheme: s("bib-numbers") }).id).toBe("name-callout");
  });
  it("copes with a missing event scheme by falling back to Name call-out", () => {
    expect(effectiveScheme(null, null).id).toBe("name-callout");
  });
  it("an own scheme with an edited palette is used as stored", () => {
    const own: IdentificationScheme = { ...s("vests-per-heat"), palette: [{ key: "teal", label: "Teal", hex: "#008080" }] };
    expect(effectiveScheme(event, { scheme: own }).palette.map((c) => c.key)).toEqual(["teal"]);
  });
});

describe("the Riders table shows each rider as judges will see them, under every built-in scheme", () => {
  for (const scheme of builtInSchemes()) {
    it(`${scheme.id}: primary, call-out and secondary lines`, () => {
      const l = tableLabel(scheme, full);
      expect(l.primary.text.length).toBeGreaterThan(0);
      expect(l.callout.length).toBeGreaterThan(0);
      if (scheme.vestAssignment === "per_heat_slot" && scheme.primary === "vest_colour") {
        expect(l.primary.text).toBe(copy.riders.lycraAtDraw);
        expect(l.primary.kind).toBe("none");
      } else {
        expect(l.primary.text).not.toBe(copy.riderLabel.notSet);
      }
    });
  }
  it("name call-out: the name is the big text", () => expect(tableLabel(s("name-callout"), full).primary.text).toBe("Sam Sample"));
  it("fixed lycra: the colour, in words", () => expect(tableLabel(s("fixed-lycra-per-rider"), full).primary.text).toBe("RED"));
  it("bib numbers: the number", () => expect(tableLabel(s("bib-numbers"), full).primary.text).toBe("14"));
  it("kite: brand, model, size and colours", () => expect(tableLabel(s("kites-no-vests"), full).primary.text).toBe("North Orbit 9 · blue/white"));
  it("a rider with nothing entered says it is not set", () => {
    expect(tableLabel(s("bib-numbers"), { name: "Nobody" }).primary.text).toBe(copy.riderLabel.notSet);
  });
  it("brand launch: before the draw the rash guard colour stands in and is marked as the fallback", () => {
    const l = tableLabel(s("brand-launch-same-kites"), full);
    expect(l.primary.text).toBe(copy.riders.lycraAtDraw);
  });
});
