// The timetable never throws in a page (fix-run-order-duration): a heat with no length, or a row whose heat is gone from the draw,
// comes back as a row with a plain warning and the rest of the day is still worked out.
import { describe, expect, it } from "vitest";
import type { SchedulePlan } from "@/lib/schemas/schedule";
import { computeTimetable } from "./timetable";
import { timetableExportRows } from "./run-order";
import { DAY, TZ } from "./fixtures";
import type { HeatLive } from "./types";

const defaults = { breakAfterHeatMin: 2, breakAfterRoundMin: 2, readyCallMin: 15 };
const opts = { timezone: TZ, eventDay: DAY, defaults };
const heat = (id: string, extra: Partial<HeatLive> = {}): HeatLive => ({ heatId: id, division: "Pro Women", round: "R1", heat: `Heat ${id}`, durationMin: 10, warmUpMin: 0, breakAfterHeatMin: 2, breakAfterRoundMin: 2, ...extra });
const plan = (items: SchedulePlan["items"], anchors: Record<string, string> = { r1: "10:00" }): SchedulePlan => ({ id: "p", name: "A", active: true, anchors, actualStarts: {}, items });
const item = (n: number, heatId: string, extra: object = {}) => ({ id: `r${n}`, kind: "heat" as const, heatId, ...extra });

const NO_LENGTH = "No heat length — set it in Divisions → Format";

describe("length: the run item's own length, else the heat's, else a warning", () => {
  it("the heat's length is used when the item has none", () => {
    const t = computeTimetable(plan([item(1, "A")]), [heat("A", { durationMin: 12 })], opts);
    expect(t.rows[0]).toMatchObject({ durationMin: 12, start: "10:00", end: "10:12" });
    expect(t.rows[0].warnings).toEqual([]);
  });

  it("the item's own length wins over the heat's", () => {
    const t = computeTimetable(plan([item(1, "A", { durationMin: 7 })]), [heat("A", { durationMin: 12 })], opts);
    expect(t.rows[0]).toMatchObject({ durationMin: 7, end: "10:07" });
  });

  it("warm-up: the item's own, else the heat's, else 0", () => {
    const own = computeTimetable(plan([item(1, "A", { warmUpMin: 5 })], { r1: "10:00" }), [heat("A", { warmUpMin: 3 })], opts).rows[0];
    const fromHeat = computeTimetable(plan([item(1, "A")]), [heat("A", { warmUpMin: 3 })], opts).rows[0];
    const none = computeTimetable(plan([item(1, "A")]), [{ heatId: "A", durationMin: 10 }], opts).rows[0];
    expect([own.warmUpMin, fromHeat.warmUpMin, none.warmUpMin]).toEqual([5, 3, 0]);
  });
});

describe("a heat that exists but has no length", () => {
  const heats = [heat("A"), heat("B", { durationMin: undefined }), heat("C")];
  const t = computeTimetable(plan([item(1, "A"), item(2, "B"), item(3, "C")]), heats, opts);

  it("does not throw, and the row carries the warning", () => {
    expect(t.rows).toHaveLength(3);
    expect(t.rows[1].warnings).toEqual([NO_LENGTH]);
    expect(t.rows.map((r) => r.issue)).toEqual([null, "no-length", null]);
    expect(t.warnings).toContain(`Pro Women R1 Heat B: ${NO_LENGTH}`);
  });

  it("takes no time but the rest of the day is still computed (A 10:00–10:10, B at 10:12, C at 10:14)", () => {
    expect(t.rows[1]).toMatchObject({ durationMin: 0, start: "10:12", end: "10:12" });
    expect(t.rows[2]).toMatchObject({ start: "10:14", end: "10:24" });
    expect(t.finish).toBe("10:24");
  });

  it("a length of 0, a negative one or NaN counts as missing too", () => {
    for (const bad of [0, -5, Number.NaN]) {
      const row = computeTimetable(plan([item(1, "A")]), [heat("A", { durationMin: bad })], opts).rows[0];
      expect(row.warnings).toEqual([NO_LENGTH]);
    }
  });

  it("a heat that is already running without a length still shows its start", () => {
    const running = [heat("A", { durationMin: undefined, startedAt: "2026-10-03T07:00:00.000Z" })];
    const row = computeTimetable(plan([item(1, "A")]), running, { ...opts, now: "2026-10-03T07:05:00.000Z" }).rows[0];
    expect(row.status).toBe("live");
    expect(row.warnings).toContain(NO_LENGTH);
  });
});

describe("a run-order row whose heat is gone from the draw (draw re-made after the heat was added)", () => {
  const heats = [heat("A"), heat("C")];
  const t = computeTimetable(plan([item(1, "A"), item(2, "GONE"), item(3, "C")]), heats, opts);

  it("does not throw; the row says the heat is gone and to remove it", () => {
    expect(t.rows[1].warnings).toEqual(["This heat is no longer in the draw (the draw was changed after it was added). Take this row out of the run order."]);
    expect(t.rows[1].label).toBe("r2");
    expect(t.rows[1].issue).toBe("no-heat");
  });

  it("takes no time and is never the next heat: the heat after it starts as if it were not there", () => {
    expect(t.rows[1]).toMatchObject({ status: "cancelled", start: null, end: null });
    expect(t.rows[2].start).toBe("10:12");
    expect(t.heatsLeft).toBe(2);
    expect(t.rows.filter((r) => r.status === "next").map((r) => r.heatId)).toEqual(["A"]);
  });
});

describe("a heat row with no heat id yet", () => {
  it("does not throw either", () => {
    const t = computeTimetable(plan([item(1, "A"), { id: "r2", kind: "heat" as const }, item(3, "C")]), [heat("A"), heat("C")], opts);
    expect(t.rows[1].warnings).toHaveLength(1);
    expect(t.rows[1].status).toBe("cancelled");
    expect(t.rows[2].start).toBe("10:12");
  });
});

describe("a break without a length", () => {
  it("does not throw and says so", () => {
    const t = computeTimetable(plan([item(1, "A"), { id: "b2", kind: "break" as const, label: "Lunch", durationMin: undefined as unknown as number }, item(3, "C")]), [heat("A"), heat("C")], opts);
    expect(t.rows[1].warnings).toEqual(["No break length — set it on the row in the run order."]);
    expect(t.rows[2].start).toBe("10:10");
  });
});

describe("the printed timetable", () => {
  it("leaves out a row whose heat is gone and prints a heat with no length without one", () => {
    const heats = [heat("A"), heat("B", { durationMin: undefined })];
    const t = computeTimetable(plan([item(1, "A"), item(2, "GONE"), item(3, "B")]), heats, opts);
    const { rows } = timetableExportRows(t);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.duration)).toEqual(["10", ""]);
  });
});
