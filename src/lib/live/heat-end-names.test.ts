import { describe, expect, it } from "vitest";
import { copy } from "@/lib/ui-copy";
import { impressionNameOf, withImpressionName } from "@/lib/schemas/impression-name";
import { parseScoringModel } from "@/lib/schemas/scoring-model";
import legacy from "../../../presets/scoring/legacy-kol-best3-variety.json";
import kota from "../../../presets/scoring/kota-best3-impression.json";
import { openWorkParts } from "./heat-end";

// HE1: no sentence the heat end added carries the name of the separate score ("Impression", "Variety", …) or a judge's name written out: they come from the event.
const E = copy.heatEnd;

describe("the name of the separate score comes from the event", () => {
  for (const name of ["Impression", "Variety", "Flow", "Style"]) {
    it(`"${name}": the Done button, its words for assistive technology and the judge's strip all use it`, () => {
      expect(E.done(name)).toBe(`Done — ${name}`);
      expect(E.doneAria(name)).toContain(name);
      expect(E.judgeScores(name)).toContain(name);
    });
  }
  it("a division with no separate score has no name to show: the button says Submit and the strip does not name one", () => {
    expect(E.done(null)).toBe("Done — Submit");
    expect(E.judgeScores(null)).not.toMatch(/Impression|Variety/);
  });
  it("no fixed sentence of the heat end names the score: only the functions that are given the name do", () => {
    const fixed = Object.entries(E).filter(([, v]) => typeof v === "string") as Array<[string, string]>;
    for (const [key, text] of fixed) expect({ key, named: /Impression|Variety/i.test(text) }).toEqual({ key, named: false });
    // the functions are asked with a made-up name and with none: only the ones that take the score's name may repeat it
    for (const [key, fn] of Object.entries(E)) {
      if (typeof fn !== "function" || ["done", "doneAria", "judgeScores"].includes(key)) continue;
      const text = String((fn as (...a: unknown[]) => unknown)("Zed", 2, "Zed"));
      expect({ key, named: /Impression|Variety/i.test(text) }).toEqual({ key, named: false });
    }
  });
  it("the sentences about who is still working take the judge's name from the event", () => {
    const parts = openWorkParts({ spotter: false, judges: [{ seatId: "s1", lines: 2 }], flags: [] }, { spotter: E.spotterLogging, judge: (id, n) => E.judgeLinesToScore(id === "s1" ? "Karim" : id, n), flags: E.openFlags });
    expect(parts).toEqual(["Karim: 2 lines to score"]);
  });
  it("the Event step's name for the score is laid over a division's own name; Arrow's scoring says Variety until the event says Impression", () => {
    const arrow = parseScoringModel(structuredClone(legacy as never));
    expect(impressionNameOf(parseScoringModel(structuredClone(kota as never)))).toBe("Impression");
    expect(impressionNameOf(arrow)).toBe("Variety");
    expect(impressionNameOf(withImpressionName(arrow, "Impression"))).toBe("Impression");
    expect(E.done(impressionNameOf(withImpressionName(arrow, "Impression")))).toBe("Done — Impression");
  });
});
