import { describe, expect, it } from "vitest";
import { divisionsStepMissing, eventStepMissing, wizardSteps } from "./status";

describe("wizard 'what's missing'", () => {
  it("event step names each gap in plain words", () => {
    expect(eventStepMissing({ name: "Arrow", slug: "arrow", start_date: null, end_date: null, location: "", status: "draft" })).toEqual([
      "Set the first and last day of the event.",
      "Add the location.",
    ]);
    expect(eventStepMissing({ name: "Arrow", slug: "arrow", start_date: "2026-10-02", end_date: "2026-10-04", location: "El Gouna", status: "draft" })).toEqual([]);
  });

  it("divisions step: none yet, then per-division gaps", () => {
    expect(divisionsStepMissing([])).toEqual(["Add at least one division (for example Pro Men)."]);
    expect(divisionsStepMissing([{ id: "1", name: "Pro Men", scoring_model_id: null, format_template_id: "f" }, { id: "2", name: "Women", scoring_model_id: "s", format_template_id: null }])).toEqual([
      "Pro Men: choose how it is scored.",
      "Women: choose its format.",
    ]);
  });

  it("later steps are listed but not available yet", () => {
    const steps = wizardSteps(null, []);
    expect(steps.map((s) => [s.key, s.available])).toEqual([["event", true], ["divisions", true], ["riders", false], ["officials", false], ["draw", false], ["schedule", false]]);
  });
});
