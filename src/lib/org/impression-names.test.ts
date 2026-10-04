import { describe, expect, it } from "vitest";
import kota from "../../../presets/scoring/kota-best3-impression.json";
import legacy from "../../../presets/scoring/legacy-kol-best3-variety.json";
import club from "../../../presets/scoring/club-quick-best2.json";
import { divisionImpressionNames, impressionPlaceholder } from "./impression-names";

const row = (json: unknown, overrides: unknown = null) => ({ scoring_overrides: overrides, scoring_models: { json } });

describe("the Event step's empty 'Name of the impression score' field shows what the divisions call it now (Polish 3, item 10)", () => {
  it("one name per division, in order, the same name once", () => {
    expect(divisionImpressionNames([row(legacy)])).toEqual(["Variety"]);
    expect(divisionImpressionNames([row(kota), row(legacy), row(kota)])).toEqual(["Impression", "Variety"]);
  });
  it("a division's own override of the name counts", () => {
    expect(divisionImpressionNames([row(kota, { heat: { impression: { label: "Style" } } })])).toEqual(["Style"]);
  });
  it("a division without a separate score, or without a model, adds nothing", () => {
    expect(divisionImpressionNames([row(club), { scoring_overrides: null, scoring_models: null }, row(legacy)])).toEqual(["Variety"]);
    expect(divisionImpressionNames([])).toEqual([]);
  });
  it("the placeholder is those names, or the default word when no division has the score yet", () => {
    expect(impressionPlaceholder(["Variety"], "Impression")).toBe("Variety");
    expect(impressionPlaceholder(["Impression", "Variety"], "Impression")).toBe("Impression, Variety");
    expect(impressionPlaceholder([], "Impression")).toBe("Impression");
  });
});
