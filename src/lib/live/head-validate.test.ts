import { describe, expect, it } from "vitest";
import { checkImpression, checkTrickScore } from "./head-validate";
import { preset } from "@/lib/engine/scoring/fixtures";

// docs/08 §1F: 8.55 on a 0.1 step is refused — the head judge's edits obey the same scales as a judge's pad
describe("head judge's score edits obey the scale", () => {
  const single = preset("legacy-kol-best3-variety", (m) => {
    m.trick.scale.step = 0.1;
  });
  const criteria = preset("kota-best3-impression");
  it("a single score on its step is fine, 8.55 on a 0.1 step is refused, out of range is refused", () => {
    expect(checkTrickScore(single, { score: 8.5 })).toBeNull();
    expect(checkTrickScore(single, { score: 8.55 })).toBe("SCORE_OFF_STEP");
    expect(checkTrickScore(single, { score: 11 })).toBe("SCORE_OUT_OF_RANGE");
    expect(checkTrickScore(single, { score: -1 })).toBe("SCORE_OUT_OF_RANGE");
  });
  it("criteria: every criterion on its own scale; a missing one is refused", () => {
    expect(checkTrickScore(criteria, { criteria: { height: 8, extremity: 7.5, technicality: 7, execution: 8 } })).toBeNull();
    expect(checkTrickScore(criteria, { criteria: { height: 8, extremity: 7.55, technicality: 7, execution: 8 } })).toBe("SCORE_OFF_STEP");
    expect(checkTrickScore(criteria, { criteria: { height: 8, extremity: 7.5, technicality: 7 } })).toBe("SCORE_MISSING_CRITERION");
  });
  it("Missed needs no value", () => expect(checkTrickScore(single, { missed: true })).toBeNull());
  it("an Impression / Variety score follows the model's impression scale; a model without one refuses", () => {
    expect(checkImpression(single, 7.5)).toBeNull();
    expect(checkImpression(single, 7.25)).toBe("SCORE_OFF_STEP");
    expect(checkImpression(preset("megaloop-single-best"), 5)).toBe("NO_IMPRESSION");
  });
});
