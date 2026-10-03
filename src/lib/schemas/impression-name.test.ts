import { describe, expect, it } from "vitest";
import { EventSettingsSchema } from "./event-settings";
import { DEFAULT_IMPRESSION_NAME, impressionNameOf, withImpressionName } from "./impression-name";
import { parseScoringModel } from "./scoring-model";
import legacy from "../../../presets/scoring/legacy-kol-best3-variety.json";
import kota from "../../../presets/scoring/kota-best3-impression.json";
import overall from "../../../presets/scoring/overall-impression.json";

const model = (json: unknown) => parseScoringModel(structuredClone(json as never));

describe("the name of the impression score (Event step)", () => {
  it("is empty by default: every division keeps the name its own scoring gives the score", () => {
    expect(EventSettingsSchema.parse({}).impressionName).toBe("");
    expect(impressionNameOf(model(kota))).toBe("Impression");
    expect(impressionNameOf(model(legacy))).toBe("Variety");
  });
  it("a name that is set replaces the division's own name everywhere", () => {
    expect(impressionNameOf(withImpressionName(model(kota), "Variety"))).toBe("Variety");
    expect(impressionNameOf(withImpressionName(model(legacy), "Impression"))).toBe("Impression");
  });
  it("is trimmed, and empty or blank leaves the division's own name alone", () => {
    expect(EventSettingsSchema.parse({ impressionName: "  Variety  " }).impressionName).toBe("Variety");
    expect(impressionNameOf(withImpressionName(model(legacy), ""))).toBe("Variety");
    expect(impressionNameOf(withImpressionName(model(legacy), "   "))).toBe("Variety");
    expect(impressionNameOf(withImpressionName(model(legacy), null))).toBe("Variety");
  });
  it("a division with no separate score has none to name: nothing is invented", () => {
    const m = model({ ...overall, heat: { ...overall.heat, impression: null } });
    expect(withImpressionName(m, "Variety").heat.impression).toBeNull();
    expect(impressionNameOf(m)).toBe(DEFAULT_IMPRESSION_NAME);
  });
  it("never changes the scale, the weight or anything else of the model", () => {
    const m = model(kota);
    const named = withImpressionName(m, "Variety");
    expect({ ...named.heat.impression, label: "" }).toEqual({ ...m.heat.impression, label: "" });
    expect(named.trick).toEqual(m.trick);
  });
  it("more than 24 characters is refused in the house style", () => {
    expect(EventSettingsSchema.safeParse({ impressionName: "x".repeat(25) }).success).toBe(false);
  });
});
