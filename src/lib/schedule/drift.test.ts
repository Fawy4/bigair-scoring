import { describe, expect, it } from "vitest";
import type { Timetable, TimetableRow } from "@/lib/engine/schedule";
import { allHeats, at, idOf, opts, patch, plan, withActuals } from "@/lib/engine/schedule/fixtures";
import { driftOf, driftTone, plannedTimetable, scheduleDrift } from "./drift";

// The schedule-drift badge: the next heat that has not started, its time in the plan as written against its time now. "On schedule" / "6 min late" / "4 min early";
// green, amber up to 10 minutes late, red beyond. Computed from the timetable engine; nothing is stored.
const main = plan("main");

const row = (itemId: string, startUtc: string | null, status: TimetableRow["status"], kind: TimetableRow["kind"] = "heat"): TimetableRow =>
  ({ itemId, kind, heatId: kind === "heat" ? `h-${itemId}` : undefined, label: itemId, startUtc, endUtc: null, start: null, end: null, durationMin: 10, warmUpMin: 0, warmUpStartUtc: null, warmUpStart: null, breakAfterMin: null, status, pinned: false, readyCallUtc: null, readyCall: null, reason: "", warnings: [], issue: null }) as TimetableRow;
const table = (rows: TimetableRow[]): Timetable => ({ rows, finishUtc: null, finish: null, heatsLeft: rows.length, warnings: [] });
const T = (hhmm: string) => `2026-10-03T${hhmm}:00Z`;

describe("the colour", () => {
  it("green while on time or early, amber from 1 to 10 minutes late, red beyond", () => {
    expect([-4, 0].map(driftTone)).toEqual(["green", "green"]);
    expect([1, 6, 10].map(driftTone)).toEqual(["amber", "amber", "amber"]);
    expect([11, 40].map(driftTone)).toEqual(["red", "red"]);
  });
});

describe("drift between two timetables", () => {
  const planned = table([row("a", T("10:00"), "done"), row("b", T("10:20"), "est"), row("c", T("10:40"), "est")]);
  it("the first heat that has not started is compared with the plan as written", () => {
    expect(driftOf(planned, table([row("a", T("10:00"), "done"), row("b", T("10:26"), "next"), row("c", T("10:46"), "est")]))).toMatchObject({ state: "late", minutes: 6, tone: "amber", itemId: "b" });
  });
  it("early is early: 4 minutes ahead is green", () => {
    expect(driftOf(planned, table([row("a", T("10:00"), "done"), row("b", T("10:16"), "next"), row("c", T("10:36"), "est")]))).toMatchObject({ state: "early", minutes: 4, tone: "green" });
  });
  it("the same time is on schedule", () => {
    expect(driftOf(planned, table([row("a", T("10:00"), "done"), row("b", T("10:20"), "next"), row("c", T("10:40"), "est")]))).toMatchObject({ state: "on_schedule", minutes: 0, tone: "green" });
  });
  it("more than 10 minutes late is red", () => {
    expect(driftOf(planned, table([row("a", T("10:00"), "done"), row("b", T("10:35"), "next"), row("c", T("10:55"), "est")]))).toMatchObject({ state: "late", minutes: 15, tone: "red" });
  });
  it("a heat on the water, a break or a cancelled heat is not 'the next heat'", () => {
    const now = table([row("a", T("10:00"), "live"), row("brk", T("10:12"), "est", "break"), row("x", T("10:15"), "cancelled"), row("b", T("10:24"), "est")]);
    expect(driftOf(planned, now)).toMatchObject({ itemId: "b", minutes: 4 });
  });
  it("nothing to say when every heat has run, when the plan is on hold (no times) or when there is no plan", () => {
    expect(driftOf(planned, table([row("a", T("10:00"), "done"), row("b", T("10:20"), "done")]))).toBeNull();
    expect(driftOf(planned, table([row("b", null, "held")]))).toBeNull();
    expect(driftOf(null, planned)).toBeNull();
    expect(driftOf(planned, null)).toBeNull();
  });
});

describe("drift from the real engine (kitemania day 2)", () => {
  it("nothing has started and it is before the first heat: on schedule", () => {
    const d = scheduleDrift(main, allHeats(), opts(at("08:00")));
    expect(d).toMatchObject({ state: "on_schedule", minutes: 0, tone: "green" });
  });
  it("a heat that starts 2 minutes late pushes the next heat 2 minutes late (the 3D example: Heat 3 at 15:25 instead of 15:23)", () => {
    const heats = patch(withActuals(main, 7), idOf("p-r1-h2"), { startedAt: at("15:10") });
    const now = at("15:11");
    const d = scheduleDrift(main, heats, opts(now));
    expect(d).toMatchObject({ state: "late", minutes: 2, tone: "amber", itemId: "p-r1-h3" });
    // the plan as written is untouched by what happened
    const written = plannedTimetable(main, heats, opts(now));
    expect(written.rows.find((r) => r.itemId === "p-r1-h3")?.start).toBe("15:23");
  });
  it("a much later start turns it red", () => {
    const heats = patch(withActuals(main, 7), idOf("p-r1-h2"), { startedAt: at("15:25") });
    expect(scheduleDrift(main, heats, opts(at("15:26")))).toMatchObject({ state: "late", tone: "red" });
  });
});
