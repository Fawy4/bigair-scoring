import { describe, expect, it } from "vitest";
import { builtInSchemes } from "@/lib/schemas/identification";
import { ARROW_ORG_SLUG, schemeFromSettings } from "./arrow-scheme";

describe("the Arrow event's Rider label scheme on /design", () => {
  const lycra = builtInSchemes().find((s) => s.id === "vests-per-heat")!;

  it("reads the scheme the organiser saved in the event settings", () => {
    const got = schemeFromSettings({ identification: { scheme: lycra, allowDivisionOverride: false } });
    expect(got?.id).toBe("vests-per-heat");
    expect(got?.palette.length).toBeGreaterThan(5);
  });
  it("an event that never chose one has none: the page then shows the three standard schemes", () => {
    expect(schemeFromSettings({})).toBeNull();
    expect(schemeFromSettings(null)).toBeNull();
    expect(schemeFromSettings({ identification: {} })).toBeNull();
  });
  it("a damaged scheme is ignored, never shown half-drawn", () => {
    expect(schemeFromSettings({ identification: { scheme: { id: "x", primary: "nonsense" } } })).toBeNull();
  });
  it("looks for the organisation whose address is arrow", () => expect(ARROW_ORG_SLUG).toBe("arrow"));
});
