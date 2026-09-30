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

  it("Riders and Officials are open; the draw and the timetable come later", () => {
    const steps = wizardSteps(null, []);
    expect(steps.map((s) => [s.key, s.available])).toEqual([["event", true], ["divisions", true], ["riders", true], ["officials", true], ["draw", false], ["schedule", false]]);
  });

  it("riders and officials steps say what is missing", () => {
    const divs = [{ id: "a", name: "Pro Men", scoring_model_id: "s", format_template_id: "f" }, { id: "b", name: "Women", scoring_model_id: "s", format_template_id: "f" }];
    const counts = { ridersByDivision: { a: 12 }, judgeSeats: 0, pendingSeats: 2, panelShortfalls: ["Pro Men needs 3 judges, 0 assigned"] };
    const steps = wizardSteps(null, divs, counts);
    expect(steps.find((s) => s.key === "riders")!.missing).toEqual(["Women: add riders."]);
    expect(steps.find((s) => s.key === "officials")!.missing).toEqual(["Add judge seats.", "2 officials are waiting for approval.", "Pro Men needs 3 judges, 0 assigned"]);
    expect(wizardSteps(null, divs, { ridersByDivision: { a: 1, b: 1 }, judgeSeats: 3, pendingSeats: 0, panelShortfalls: [] }).filter((s) => s.key === "riders" || s.key === "officials").every((s) => s.missing.length === 0)).toBe(true);
  });
});
