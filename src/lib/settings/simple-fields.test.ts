import { describe, expect, it } from "vitest";
import { help } from "@/lib/ui-copy";
import { EVENT_ADVANCED, EVENT_SIMPLE, FORMAT_SIMPLE, SCORING_SIMPLE, simpleText } from "./simple-fields";

// docs/06 decision 32 (and the plan, step 3): the Simple level of each panel is exactly this list.
describe("the Simple dials", () => {
  it("Scoring (Polish 2, item 8): what judges enter and its scale, which tricks count and how many, attempts, judges and averaging (trimming), Impression / Variety and its scale", () => {
    expect(SCORING_SIMPLE.map((f) => f.path)).toEqual(["trick.entry", "trick.scale", "heat.counting.type", "heat.counting.n", "heat.counting.maxPerCategory", "heat.maxAttemptsPerRider", "panel.minJudges", "panel.aggregate", "panel.trimMinJudges", "heat.impression", "heat.impression.scale.max"]);
  });
  it("Format: ladder type, riders per heat, minimum and maximum per heat, how many advance, final size, heat length per round", () => {
    expect(FORMAT_SIMPLE.map((f) => f.id)).toEqual(["type", "heatSize", "minHeat", "maxHeat", "advance", "finalSize", "perRound"]);
  });
  it("Event: name, dates, place, time zone, lycras yes or no, what spectators see", () => {
    expect(EVENT_SIMPLE.map((f) => f.id)).toEqual(["name", "dates", "location", "timeZone", "lycra", "visibility"]);
  });
  it("Event, behind the fold: 19 settings, each in a group of the form", () => {
    expect(EVENT_ADVANCED).toHaveLength(23);
    expect(new Set(EVENT_ADVANCED).size).toBe(23);
  });
  it("every Simple dial has a label, a line of explanation and a “?” example (a “?” never opens nothing)", () => {
    for (const f of [...SCORING_SIMPLE, ...FORMAT_SIMPLE, ...EVENT_SIMPLE]) {
      const t = simpleText(f);
      expect(t.label.length, f.id).toBeGreaterThan(3);
      expect(t.explanation.length, f.id).toBeGreaterThan(10);
      expect(t.example && t.example.length, f.id).toBeGreaterThan(5);
      expect(help[f.helpKey], f.helpKey).toBeDefined();
    }
  });
});
