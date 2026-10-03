import { describe, expect, it } from "vitest";
import { checkImpression, checkTrickScore, impressionRefusal, stepNeighbours, trickScoreRefusal } from "./head-validate";
import { errorSentence } from "./errors";
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

  // A1a-3: the refusal says what the step is, and which two values are on it
  it("a typed 7.25 on a 0.1 step is refused with a sentence that names the step and the two values next to it", () => {
    const r = impressionRefusal(criteria, 7.25)!;
    expect(r).toEqual({ code: "SCORE_OFF_STEP", detail: "0.1|7.2|7.3" });
    expect(errorSentence(`${r.code}: ${r.detail}`)).toBe("That score is not on the 0.1 step. Use 7.2 or 7.3.");
  });
  it("a criterion off a 0.5 step names that step", () => {
    const m = preset("kota-best3-impression", (x) => {
      x.trick.criteria[0].scale.step = 0.5;
    });
    const r = trickScoreRefusal(m, { criteria: { height: 7.3, extremity: 7, technicality: 7, execution: 7 } })!;
    expect(errorSentence(`${r.code}: ${r.detail}`)).toBe("That score is not on the 0.5 step. Use 7 or 7.5.");
  });
  it("out of range names the range", () => {
    const r = impressionRefusal(criteria, 10.5)!;
    expect(errorSentence(`${r.code}: ${r.detail}`)).toBe("That score is outside the scale (0 to 10).");
  });
  it("the neighbours are counted from the scale's minimum and stay inside the scale", () => {
    expect(stepNeighbours(5.7, { min: 5, max: 10, step: 0.5 })).toEqual([5.5, 6]);
    expect(stepNeighbours(9.96, { min: 0, max: 10, step: 0.1 })[1]).toBe(10);
  });
  it("without a detail the old sentences still read well", () => {
    expect(errorSentence("SCORE_OFF_STEP")).toBe("That score is not on the scale's step.");
    expect(errorSentence("SCORE_OUT_OF_RANGE")).toBe("That score is outside the scale.");
  });
});
