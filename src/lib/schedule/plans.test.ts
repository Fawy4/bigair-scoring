import { describe, expect, it } from "vitest";
import { clockIn, defaultsOf, eventDays, planToRow, rowToPlan, todayIn } from "./plans";

describe("stored plans", () => {
  const row = { id: "p1", event_id: "e", day: "2026-10-03", name: "Plan A", items: [{ id: "r1", kind: "heat", heatId: "h1", durationMin: 10 }], anchors: { r1: "10:00" }, actual_starts: {}, hold: null, defaults: { breakAfterHeatMin: 2 }, active: true };

  it("a row becomes a checked plan with defaults filled in", () => {
    const { plan, day, defaults } = rowToPlan(row, 15);
    expect(plan).toMatchObject({ id: "p1", name: "Plan A", active: true, anchors: { r1: "10:00" } });
    expect(day).toBe("2026-10-03");
    expect(defaults).toEqual({ breakAfterHeatMin: 2, breakAfterRoundMin: 5, readyCallMin: 15 });
  });

  it("a damaged plan says so instead of turning into an empty one", () => {
    expect(() => rowToPlan({ ...row, anchors: { ghost: "10:00" } }, 15)).toThrow(/damaged/);
    expect(() => rowToPlan({ ...row, anchors: { r1: "25:99" } }, 15)).toThrow(/damaged/);
  });

  it("the plan goes back to its row without the day and the flags", () => {
    expect(planToRow(rowToPlan(row, 15).plan)).toEqual({ name: "Plan A", items: row.items, anchors: row.anchors, actual_starts: {}, hold: null });
  });

  it("the ready call is the event's one setting, not something stored on the run order: a stored value is ignored", () => {
    expect(defaultsOf({ breakAfterHeatMin: 2, readyCallMin: 5 }, 20)).toEqual({ breakAfterHeatMin: 2, breakAfterRoundMin: 5, readyCallMin: 20 });
    expect(rowToPlan({ ...row, defaults: { readyCallMin: 5 } }, 12).defaults.readyCallMin).toBe(12);
  });

  it("defaults fall back for anything unreadable", () => {
    expect(defaultsOf(null, 15)).toEqual({ breakAfterHeatMin: 3, breakAfterRoundMin: 5, readyCallMin: 15 });
    expect(defaultsOf({ breakAfterHeatMin: "x" }, 15)).toEqual({ breakAfterHeatMin: 3, breakAfterRoundMin: 5, readyCallMin: 15 });
  });
});

describe("event days", () => {
  it("every day from the first to the last", () => {
    expect(eventDays("2026-10-02", "2026-10-04")).toEqual(["2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(eventDays("2026-10-02", null)).toEqual(["2026-10-02"]);
    expect(eventDays("2026-10-02", "2026-10-01")).toEqual(["2026-10-02"]);
    expect(eventDays(null, null)).toEqual([]);
  });

  it("today and the clock are read in the event's time zone", () => {
    const at = Date.parse("2026-10-03T22:30:00Z"); // 01:30 the next day in Cairo (UTC+3 in October 2026? DST ended in late October: +3)
    expect(todayIn("Africa/Cairo", at)).toBe("2026-10-04");
    expect(clockIn("Africa/Cairo", at)).toBe("01:30");
    expect(todayIn("UTC", at)).toBe("2026-10-03");
  });
});
