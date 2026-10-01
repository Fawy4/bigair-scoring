// Scoring by criteria on the judge's phone: the trick score appears when every criterion is set (docs/08 §1A, Judge 1).
import { describe, expect, it } from "vitest";
import kotaJson from "../../../presets/scoring/kota-best3-impression.json";
import { parseScoringModel } from "@/lib/schemas/scoring-model";
import { criteriaRows, criteriaScore } from "./criteria";

const kota = parseScoringModel(structuredClone(kotaJson));

describe("criteria on the phone", () => {
  it("one tab per criterion, in the model's order, each on its own scale", () => {
    const rows = criteriaRows(kota)!;
    expect(rows.map((r) => r.key)).toEqual(["height", "extremity", "technicality", "execution"]);
    expect(rows[0].scale).toEqual(kota.trick.criteria[0].scale);
  });
  it("the trick score is worked out once every criterion is set: Judge 1, attempt 1 gives 7.625", () => {
    expect(criteriaScore(kota, { height: 8.0, extremity: 7.5, technicality: 7.0 })).toBeNull();
    expect(criteriaScore(kota, { height: 8.0, extremity: 7.5, technicality: 7.0, execution: 8.0 })).toBe(7.625);
  });
  it("a value off the scale gives nothing instead of failing", () => {
    expect(criteriaScore(kota, { height: 99, extremity: 7.5, technicality: 7.0, execution: 8.0 })).toBeNull();
  });
  it("a model with a single mark has no criteria tabs", () => {
    const single = { ...kota, trick: { ...kota.trick, entry: "single" as const } };
    expect(criteriaRows(single)).toBeNull();
    expect(criteriaScore(single, { height: 8 })).toBeNull();
  });
});
