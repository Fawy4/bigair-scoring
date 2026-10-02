import { describe, expect, it } from "vitest";
import { FormatTemplateSchema } from "@/lib/schemas/format-template";
import { ScoringModelSchema } from "@/lib/schemas/scoring-model";
import { FORMAT_HIDDEN, FORMAT_LABELS, SCORING_HIDDEN, SCORING_LABELS } from "@/lib/ui-copy";
import { countFields } from "./count";
import { schemaToNodes } from "./nodes";

describe("the count on “More settings (n)”", () => {
  const scoring = schemaToNodes(ScoringModelSchema, SCORING_LABELS, SCORING_HIDDEN);
  const format = schemaToNodes(FormatTemplateSchema, FORMAT_LABELS, FORMAT_HIDDEN);
  it("counts the fields of a real schema, and fewer when paths are hidden", () => {
    const all = countFields(scoring, SCORING_HIDDEN, []);
    expect(all).toBeGreaterThan(15);
    expect(countFields(scoring, SCORING_HIDDEN, ["heat.maxAttemptsPerRider", "panel.minJudges", "panel.aggregate"])).toBe(all - 3);
  });
  it("the format form has a count too", () => expect(countFields(format, [...FORMAT_HIDDEN, "rounds", "ladder"], [])).toBeGreaterThan(5));
});
