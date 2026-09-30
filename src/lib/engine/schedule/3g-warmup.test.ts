// Phase 4b — warm-up before each heat is its own segment of the row; the competition timer is only the heat length.
// The owner's real event: Knockout 3/3/3, 15 heats for 24 riders, warm-up 5, heat 10, 2-minute breaks.
import { describe, expect, it } from "vitest";
import type { SchedulePlan } from "@/lib/schemas/schedule";
import { computeTimetable } from "./timetable";
import { at, DAY, TZ } from "./fixtures";
import type { HeatLive, TimetableOptions } from "./types";

const defaults = { breakAfterHeatMin: 2, breakAfterRoundMin: 2, readyCallMin: 15 };
const opts = (now?: string): TimetableOptions => ({ timezone: TZ, eventDay: DAY, defaults, ...(now ? { now } : {}) });

const heats = (n: number, extra: Partial<HeatLive> = {}): HeatLive[] =>
  Array.from({ length: n }, (_, i) => ({ heatId: `h${i + 1}`, division: "Pro Men", round: "R1", heat: `Heat ${i + 1}`, durationMin: 10, warmUpMin: 5, breakAfterHeatMin: 2, breakAfterRoundMin: 2, ...extra }));

const planOf = (n: number, anchors: Record<string, string> = { i1: "10:00" }): SchedulePlan => ({
  id: "p",
  name: "Plan A",
  active: true,
  anchors,
  actualStarts: {},
  items: Array.from({ length: n }, (_, i) => ({ id: `i${i + 1}`, kind: "heat" as const, heatId: `h${i + 1}` })),
});

describe("warm-up segment", () => {
  it("shows warm-up, start and end of every row: warm-up 09:55 · start 10:00 · end 10:10", () => {
    const t = computeTimetable(planOf(2), heats(2), opts());
    expect(t.rows[0]).toMatchObject({ warmUpMin: 5, warmUpStart: "09:55", start: "10:00", end: "10:10", durationMin: 10, breakAfterMin: 2 });
  });

  it("the next row's warm-up starts after the break: start = previous end + break + warm-up", () => {
    const t = computeTimetable(planOf(3), heats(3), opts());
    expect(t.rows.map((r) => [r.warmUpStart, r.start, r.end])).toEqual([
      ["09:55", "10:00", "10:10"],
      ["10:12", "10:17", "10:27"],
      ["10:29", "10:34", "10:44"],
    ]);
  });

  it("15 heats of 5 + 10 min with 2-minute breaks: last heat ends 14:08, 4 h 13 min after the first warm-up", () => {
    const t = computeTimetable(planOf(15), heats(15), opts());
    expect(t.rows[14]).toMatchObject({ start: "13:58", end: "14:08" });
    expect(t.finish).toBe("14:08");
    expect(t.heatsLeft).toBe(15);
  });

  it("a warm-up of 0 (the default) changes nothing: start = previous end + break", () => {
    const t = computeTimetable(planOf(2), heats(2, { warmUpMin: 0 }), opts());
    expect(t.rows.map((r) => [r.warmUpStart, r.start, r.end])).toEqual([
      ["10:00", "10:00", "10:10"],
      ["10:12", "10:12", "10:22"],
    ]);
  });

  it("a row can override its warm-up; a round can have its own", () => {
    const plan = planOf(3);
    plan.items[1] = { ...plan.items[1], warmUpMin: 10 } as SchedulePlan["items"][number];
    const t = computeTimetable(plan, heats(3), opts());
    expect(t.rows.map((r) => [r.warmUpStart, r.start])).toEqual([
      ["09:55", "10:00"],
      ["10:12", "10:22"],
      ["10:34", "10:39"],
    ]);
  });

  it("a pin means 'not before' the START of the heat: the warm-up moves with it", () => {
    const plan = planOf(3, { i1: "10:00", i2: "10:30" });
    const t = computeTimetable(plan, heats(3), opts());
    expect(t.rows.map((r) => [r.warmUpStart, r.start, r.end, r.pinned])).toEqual([
      ["09:55", "10:00", "10:10", true],
      ["10:25", "10:30", "10:40", true],
      ["10:42", "10:47", "10:57", false],
    ]);
  });

  it("a pin that the previous heat pushes later shows a warning and the real time", () => {
    const plan = planOf(2, { i1: "10:00", i2: "10:10" });
    const t = computeTimetable(plan, heats(2), opts());
    expect(t.rows[1]).toMatchObject({ start: "10:17", pinned: true });
    expect(t.rows[1].warnings[0]).toMatch(/Pinned for 10:10 but the previous heat finishes later/);
  });

  it("an explicit break replaces the automatic break, and the warm-up follows it", () => {
    const plan = planOf(3);
    plan.items.splice(1, 0, { id: "lunch", kind: "break", label: "Lunch", durationMin: 30 });
    const t = computeTimetable(plan, heats(3), opts());
    expect(t.rows.map((r) => [r.itemId, r.start, r.end])).toEqual([
      ["i1", "10:00", "10:10"],
      ["lunch", "10:10", "10:40"],
      ["i2", "10:45", "10:55"], // lunch ends 10:40 + 5 min warm-up
      ["i3", "11:02", "11:12"],
    ]);
  });

  it("a per-row break replaces the automatic one", () => {
    const plan = planOf(2);
    plan.items[0] = { ...plan.items[0], breakAfterMin: 10 } as SchedulePlan["items"][number];
    const t = computeTimetable(plan, heats(2), opts());
    expect(t.rows[1]).toMatchObject({ warmUpStart: "10:20", start: "10:25" });
  });

  it("nothing is projected into the past: the warm-up of the next heat starts no earlier than now", () => {
    const hs = heats(2).map((h) => (h.heatId === "h1" ? { ...h, startedAt: at("10:00"), endedAt: at("10:10") } : h));
    const t = computeTimetable(planOf(2), hs, opts(at("10:40")));
    expect(t.rows[1]).toMatchObject({ warmUpStart: "10:40", start: "10:45" });
  });

  it("a heat that has started keeps its real start; its warm-up is shown before it; later rows cascade from its real end", () => {
    const hs = heats(3).map((h) => (h.heatId === "h1" ? { ...h, startedAt: at("10:03"), endedAt: at("10:14") } : h));
    const t = computeTimetable(planOf(3), hs, opts(at("10:20")));
    expect(t.rows[0]).toMatchObject({ status: "done", warmUpStart: "09:58", start: "10:03", end: "10:14" });
    // 10:14 + 2 min break + 5 min warm-up = 10:21, but the warm-up cannot start before now (10:20), so the start is 10:25
    expect(t.rows[1]).toMatchObject({ warmUpStart: "10:20", start: "10:25" });
    expect(t.heatsLeft).toBe(2);
  });
});
