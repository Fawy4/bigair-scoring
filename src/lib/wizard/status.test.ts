import { describe, expect, it } from "vitest";
import { divisionsStepMissing, eventStepMissing, wizardSteps, type SetupCounts } from "./status";

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

  it("every step is open, including the draw, the run order and Go live", () => {
    const steps = wizardSteps(null, []);
    expect(steps.map((s) => [s.key, s.available])).toEqual([["event", true], ["divisions", true], ["riders", true], ["officials", true], ["draw", true], ["schedule", true], ["golive", true]]);
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

describe("Draw and Run order steps say what is missing", () => {
  const divs = [{ id: "a", name: "Pro Men", scoring_model_id: "s", format_template_id: "f" }, { id: "b", name: "Women", scoring_model_id: "s", format_template_id: "f" }];
  const base = { ridersByDivision: { a: 12, b: 6 }, judgeSeats: 3, pendingSeats: 0, panelShortfalls: [] };
  it("no draw, a draw that is not locked, and no active plan", () => {
    const steps = wizardSteps(null, divs, { ...base, drawn: ["a"], locked: [], activePlan: false });
    expect(steps.find((s) => s.key === "draw")!.missing).toEqual(["Pro Men: lock the draw when it is final.", "Women: make the draw."]);
    expect(steps.find((s) => s.key === "schedule")!.missing).toEqual(["Activate a run order for each event day."]);
  });
  it("nothing is missing once every draw is locked and a plan is active", () => {
    const steps = wizardSteps(null, divs, { ...base, drawn: ["a", "b"], locked: ["a", "b"], activePlan: true });
    expect(steps.filter((s) => s.key === "draw" || s.key === "schedule").every((s) => s.missing.length === 0)).toBe(true);
  });
  it("a division without riders is asked for riders, not a draw", () => {
    expect(wizardSteps(null, divs, { ...base, ridersByDivision: { a: 12 }, drawn: ["a"], locked: ["a"], activePlan: true }).find((s) => s.key === "draw")!.missing).toEqual([]);
  });
});

describe("step state and one-line reason (Phase 7a)", () => {
  const ev = { name: "Arrow", slug: "arrow", start_date: "2026-10-02", end_date: "2026-10-04", location: "El Gouna", status: "draft" };
  const div = (id: string, name: string) => ({ id, name, scoring_model_id: "s", format_template_id: "f" });
  const empty: SetupCounts = { ridersByDivision: {}, judgeSeats: 0, pendingSeats: 0, panelShortfalls: [], drawn: [], locked: [], activePlan: false, seatCount: 0, planCount: 0 };
  const full = (divs: ReturnType<typeof div>[]): SetupCounts => ({
    ridersByDivision: Object.fromEntries(divs.map((d) => [d.id, 8])),
    judgeSeats: 3, pendingSeats: 0, panelShortfalls: [], drawn: divs.map((d) => d.id), locked: divs.map((d) => d.id), activePlan: true, activePlanToday: true, seatCount: 4, planCount: 1,
    panels: divs.map((d) => ({ id: d.id, name: d.name, minJudges: 3, assigned: 3, hasScoringModel: true })), seatsWithoutPin: 0,
  });
  const by = (steps: ReturnType<typeof wizardSteps>, key: string) => steps.find((x) => x.key === key)!;

  it("nothing entered anywhere: Event is attention only when partly filled, every later step is not started", () => {
    const steps = wizardSteps({ ...ev, name: "", start_date: null, end_date: null, location: null }, [], empty);
    expect(steps.map((s) => [s.key, s.state])).toEqual([["event", "not_started"], ["divisions", "not_started"], ["riders", "not_started"], ["officials", "not_started"], ["draw", "not_started"], ["schedule", "not_started"], ["golive", "not_started"]]);
  });

  it("one case per step per state", () => {
    const divs = [div("a", "Pro Men"), div("b", "Pro Women")];
    // done
    const done = wizardSteps(ev, divs, full(divs));
    expect(done.map((s) => s.state)).toEqual(["done", "done", "done", "done", "done", "done", "done"]);
    // attention: something entered, something missing
    expect(by(wizardSteps({ ...ev, location: "" }, divs, full(divs)), "event").state).toBe("attention");
    expect(by(wizardSteps(ev, [{ ...div("a", "Pro Men"), format_template_id: null }], full(divs)), "divisions").state).toBe("attention");
    expect(by(wizardSteps(ev, divs, { ...full(divs), ridersByDivision: { a: 8 } }), "riders").state).toBe("attention");
    expect(by(wizardSteps(ev, divs, { ...full(divs), pendingSeats: 1 }), "officials").state).toBe("attention");
    expect(by(wizardSteps(ev, divs, { ...full(divs), locked: ["a"] }), "draw").state).toBe("attention");
    expect(by(wizardSteps(ev, divs, { ...full(divs), activePlan: false, activePlanToday: false }), "schedule").state).toBe("attention");
    // not started
    const none = wizardSteps(ev, divs, empty);
    expect(by(none, "riders").state).toBe("not_started");
    expect(by(none, "officials").state).toBe("not_started");
    expect(by(none, "draw").state).toBe("not_started");
    expect(by(none, "schedule").state).toBe("not_started");
    expect(by(wizardSteps(ev, [], empty), "divisions").state).toBe("not_started");
  });

  it("Go live: not started until the draw has started, attention with the first red item, done when everything is green", () => {
    const divs = [div("a", "Pro Men")];
    expect(by(wizardSteps(ev, divs, { ...full(divs), drawn: [], locked: [] }), "golive").state).toBe("not_started");
    const att = by(wizardSteps(ev, divs, { ...full(divs), seatsWithoutPin: 2 }), "golive");
    expect(att.state).toBe("attention");
    expect(att.reason).toBe("2 seats have no PIN");
    expect(by(wizardSteps(ev, divs, full(divs)), "golive").state).toBe("done");
  });

  it("reason: the first missing line, then how many more", () => {
    const divs = [div("a", "Pro Men"), div("b", "Pro Women"), div("c", "Juniors")];
    expect(by(wizardSteps(ev, divs, { ...empty, ridersByDivision: { a: 5 } }), "riders").reason).toBe("Pro Women: add riders. (+1 more)");
    expect(by(wizardSteps(ev, divs, { ...empty, ridersByDivision: { a: 5, b: 5 } }), "riders").reason).toBe("Juniors: add riders.");
    expect(by(wizardSteps(ev, divs, { ...empty, ridersByDivision: { a: 5, b: 5, c: 5 }, seatCount: 1, judgeSeats: 1, panelShortfalls: ["x", "y", "z"] }), "officials").reason).toBe("x (+2 more)");
    expect(by(wizardSteps(ev, divs, full(divs)), "riders").reason).toBe("Every division has riders");
  });
});
