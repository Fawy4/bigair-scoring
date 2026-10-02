import { describe, expect, it } from "vitest";
import type { SetupCounts } from "@/lib/wizard/status";
import { readiness } from "./readiness";

const EVENT = "11111111-1111-1111-1111-111111111111";
const divs = [
  { id: "a", name: "Pro Men", scoring_model_id: "s" },
  { id: "b", name: "Pro Women", scoring_model_id: "s" },
];
const counts = (over: Partial<SetupCounts> = {}): SetupCounts => ({
  ridersByDivision: { a: 14, b: 6 },
  judgeSeats: 3,
  pendingSeats: 0,
  panelShortfalls: [],
  drawn: ["a", "b"],
  locked: ["a", "b"],
  activePlan: true,
  activePlanToday: true,
  seatCount: 5,
  planCount: 1,
  seatsWithoutPin: 0,
  panels: [
    { id: "a", name: "Pro Men", minJudges: 3, assigned: 3, hasScoringModel: true },
    { id: "b", name: "Pro Women", minJudges: 3, assigned: 3, hasScoringModel: true },
  ],
  ...over,
});

describe("readiness checklist", () => {
  it("all green: Ready to run, each line says what is true", () => {
    const r = readiness({ eventId: EVENT, divisions: divs, counts: counts() });
    expect(r.ready).toBe(true);
    expect(r.checks.every((c) => c.state === "done")).toBe(true);
    const text = r.checks.map((c) => c.sentence);
    expect(text).toContain("Pro Men: 14 riders confirmed");
    expect(text).toContain("Pro Men: 3 of 3 judges");
    expect(text).toContain("Pro Women: draw locked");
    expect(text).toContain("Run order active for today");
    expect(text).toContain("All 5 seats have a PIN");
  });

  it("empty event: nothing is green, the first red item comes first and every check links to a step", () => {
    const r = readiness({ eventId: EVENT, divisions: [], counts: counts({ ridersByDivision: {}, panels: [], drawn: [], locked: [], activePlan: false, activePlanToday: false, seatCount: 0, judgeSeats: 0, planCount: 0 }) });
    expect(r.ready).toBe(false);
    expect(r.checks[0]).toMatchObject({ id: "divisions", state: "not_started", fixHref: `/org/events/${EVENT}/divisions` });
    expect(r.checks.every((c) => c.fixHref.startsWith(`/org/events/${EVENT}/`))).toBe(true);
    expect(r.firstOpen?.id).toBe("divisions");
  });

  it("one division short of judges", () => {
    const r = readiness({ eventId: EVENT, divisions: divs, counts: counts({ panels: [{ id: "a", name: "Pro Men", minJudges: 3, assigned: 3, hasScoringModel: true }, { id: "b", name: "Pro Women", minJudges: 3, assigned: 2, hasScoringModel: true }] }) });
    const c = r.checks.find((x) => x.id === "judges:b")!;
    expect(c).toMatchObject({ state: "attention", sentence: "Pro Women: 2 of 3 judges", fixHref: `/org/events/${EVENT}/officials` });
    expect(r.ready).toBe(false);
    expect(r.openCount).toBe(1);
  });

  it("a division without riders is asked for riders, not a draw", () => {
    const r = readiness({ eventId: EVENT, divisions: divs, counts: counts({ ridersByDivision: { a: 14 }, drawn: ["a"], locked: ["a"] }) });
    expect(r.checks.find((x) => x.id === "riders:b")).toMatchObject({ state: "attention", sentence: "Pro Women: no riders confirmed", fixHref: `/org/events/${EVENT}/riders` });
    expect(r.checks.find((x) => x.id === "draw:b")).toBeUndefined();
  });

  it("draw made but not locked, and no draw yet", () => {
    const r = readiness({ eventId: EVENT, divisions: divs, counts: counts({ drawn: ["a"], locked: [] }) });
    expect(r.checks.find((x) => x.id === "draw:a")).toMatchObject({ state: "attention", sentence: "Pro Men: draw made, not locked yet", fixHref: `/org/events/${EVENT}/draw` });
    expect(r.checks.find((x) => x.id === "draw:b")).toMatchObject({ state: "not_started", sentence: "Pro Women: no draw yet" });
  });

  it("run order: none at all, or active for another day only", () => {
    expect(readiness({ eventId: EVENT, divisions: divs, counts: counts({ activePlan: false, activePlanToday: false, planCount: 0 }) }).checks.find((x) => x.id === "run-order")).toMatchObject({ state: "not_started", fixHref: `/org/events/${EVENT}/schedule` });
    expect(readiness({ eventId: EVENT, divisions: divs, counts: counts({ activePlanToday: false }) }).checks.find((x) => x.id === "run-order")).toMatchObject({ state: "attention", sentence: "No run order is active for today" });
  });

  it("run order for another day names both dates: today and the day of the active plan", () => {
    const c = counts({ activePlanToday: false, today: "2026-10-02", activePlanDays: ["2026-10-16"] });
    expect(readiness({ eventId: EVENT, divisions: divs, counts: c }).checks.find((x) => x.id === "run-order")).toMatchObject({ state: "attention", sentence: "No run order is active for today, Fri 2 Oct — the active plan is for Fri 16 Oct", fixHref: `/org/events/${EVENT}/schedule` });
    const two = counts({ activePlanToday: false, today: "2026-10-02", activePlanDays: ["2026-10-16", "2026-10-17"] });
    expect(readiness({ eventId: EVENT, divisions: divs, counts: two }).checks.find((x) => x.id === "run-order")!.sentence).toBe("No run order is active for today, Fri 2 Oct — the active plans are for Fri 16 Oct and Sat 17 Oct");
    const none = counts({ activePlan: false, activePlanToday: false, today: "2026-10-02", activePlanDays: [], planCount: 2 });
    expect(readiness({ eventId: EVENT, divisions: divs, counts: none }).checks.find((x) => x.id === "run-order")!.sentence).toBe("No run order is active for today, Fri 2 Oct — no plan is active yet");
  });

  it("two seats without a PIN (seats made before PIN storage)", () => {
    const c = readiness({ eventId: EVENT, divisions: divs, counts: counts({ seatsWithoutPin: 2 }) }).checks.find((x) => x.id === "pins")!;
    expect(c).toMatchObject({ state: "attention", sentence: "2 seats have no PIN", fixHref: `/org/events/${EVENT}/officials` });
    expect(readiness({ eventId: EVENT, divisions: divs, counts: counts({ seatsWithoutPin: 1 }) }).checks.find((x) => x.id === "pins")!.sentence).toBe("1 seat has no PIN");
    expect(readiness({ eventId: EVENT, divisions: divs, counts: counts({ seatCount: 0, judgeSeats: 0 }) }).checks.find((x) => x.id === "pins")).toMatchObject({ state: "not_started", sentence: "No seats yet" });
  });

  it("a division with no scoring rules cannot have a judge count", () => {
    const r = readiness({ eventId: EVENT, divisions: [{ id: "a", name: "Pro Men", scoring_model_id: null }], counts: counts({ ridersByDivision: { a: 4 }, panels: [{ id: "a", name: "Pro Men", minJudges: 0, assigned: 0, hasScoringModel: false }] }) });
    expect(r.checks.find((x) => x.id === "judges:a")).toMatchObject({ state: "attention", sentence: "Pro Men: choose how it is scored", fixHref: `/org/events/${EVENT}/divisions` });
  });
});
