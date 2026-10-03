import { describe, expect, it } from "vitest";
import { copyPlanToDay, dayStatus, defaultPlanName, copySources } from "./day-plans";

// Polish 2, item 14: a day with no plan offers Create (name pre-filled) and Copy another day's plan; the Day list says per day which plan is active.
const row = (o: Partial<Record<string, unknown>> = {}) => ({
  id: "p1",
  event_id: "e",
  day: "2026-10-08",
  name: "Plan A – Thu 8 Oct",
  active: true,
  items: [
    { id: "i1", kind: "heat", heatId: "h1" },
    { id: "b1", kind: "break", label: "Lunch", durationMin: 45 },
    { id: "i2", kind: "heat", heatId: "h2" },
  ],
  anchors: { i1: "10:00", b1: "13:00", i2: "13:47" },
  actual_starts: { b1: "2026-10-08T10:02:00Z" },
  hold: null,
  defaults: {},
  hand_pins: ["i1", "b1"],
  ...o,
});

describe("copy another day's plan", () => {
  it("heats, breaks and hand-set pins are copied; actual times and the console's pins are not", () => {
    const c = copyPlanToDay(row());
    expect(c.items).toEqual(row().items);
    expect(c.anchors).toEqual({ i1: "10:00", b1: "13:00" }); // 13:47 was written by the console (Shift)
    expect(c.actual_starts).toEqual({});
    expect(c.hold).toBeNull();
    expect(c.hand_pins).toEqual(["i1", "b1"]);
  });
  it("a plan from before hand-set pins were told apart keeps every pin (it cannot tell them apart)", () => {
    expect(copyPlanToDay(row({ hand_pins: null })).anchors).toEqual({ i1: "10:00", b1: "13:00", i2: "13:47" });
  });
});

describe("the Day list", () => {
  const plans = [row(), row({ id: "p2", name: "Plan B – Thu 8 Oct", active: false }), row({ id: "p3", day: "2026-10-09", name: "Plan A – Fri 9 Oct", active: false })];
  it("“Plan A – Thu 8 Oct active”, “no active plan”, “no plan”", () => {
    expect(dayStatus(plans, "2026-10-08")).toEqual({ kind: "active", name: "Plan A – Thu 8 Oct" });
    expect(dayStatus(plans, "2026-10-09")).toEqual({ kind: "none_active", count: 1 });
    expect(dayStatus(plans, "2026-10-10")).toEqual({ kind: "no_plan" });
  });
  it("Create pre-fills “Plan A – Sat 10 Oct”; a name already used that day moves on to Plan B", () => {
    expect(defaultPlanName([], "2026-10-10")).toBe("Plan A – Sat 10 Oct");
    expect(defaultPlanName([row({ day: "2026-10-10", name: "Plan A – Sat 10 Oct" })], "2026-10-10")).toBe("Plan B – Sat 10 Oct");
  });
  it("Copy offers each other day's active plan (or its first plan), never the day itself", () => {
    expect(copySources(plans, "2026-10-10").map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(copySources(plans, "2026-10-08").map((p) => p.id)).toEqual(["p3"]);
  });
});
