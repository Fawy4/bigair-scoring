// Audit 1b — #32's "Name of the impression score" (docs/AUDIT.md). Empty (the default) = every division keeps its own name; set = every screen says the event's
// name. The officials' screens read the model through src/lib/live/context.ts and the head judge's server actions/publish through the same withImpressionName;
// the public pages through modelOf (results, live rows, big screen, rules). This pins the one rule all of them share.
import { describe, expect, it } from "vitest";
import kota from "../../../presets/scoring/kota-best3-impression.json";
import legacy from "../../../presets/scoring/legacy-kol-best3-variety.json";
import { parseEventSettings } from "@/lib/schemas/event-settings";
import { impressionNameOf } from "@/lib/schemas/impression-name";
import { modelOf } from "./results-model";

const rules = (name: string | null) =>
  ({
    allowed: true,
    impression_name: name,
    divisions: [
      { id: "kota", name: "Pro", scoring_model: kota, scoring_overrides: {}, format_template: null, format_params: {}, riders: 24 },
      { id: "variety", name: "Legacy", scoring_model: legacy, scoring_overrides: {}, format_template: null, format_params: {}, riders: 8 },
      { id: "own", name: "Own", scoring_model: kota, scoring_overrides: { heat: { impression: { label: "Show" } } }, format_template: null, format_params: {}, riders: 8 },
    ],
  }) as never;

describe("A1b — the name of the impression score", () => {
  it("the Event step's field is empty by default", () => {
    expect(parseEventSettings({}).impressionName).toBe("");
  });

  it("empty (or only spaces): each division shows its own name — KOTA 'Impression', legacy 'Variety', an override 'Show'", () => {
    for (const name of [null, "", "   "]) {
      expect(impressionNameOf(modelOf(rules(name), "kota"))).toBe(kota.heat.impression.label);
      expect(impressionNameOf(modelOf(rules(name), "variety"))).toBe(legacy.heat.impression?.label);
      expect(impressionNameOf(modelOf(rules(name), "own"))).toBe("Show");
    }
    expect(legacy.heat.impression?.label).not.toBe(kota.heat.impression.label);
  });

  it("set: every division shows the event's name, overrides included", () => {
    for (const id of ["kota", "variety", "own"]) expect(impressionNameOf(modelOf(rules("Style"), id))).toBe("Style");
  });

});
