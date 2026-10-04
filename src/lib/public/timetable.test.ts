import { describe, expect, it } from "vitest";
import { buildPublicTimetable } from "./timetable";
import type { PublicTimetable, TimetableHeat } from "./types";

// The public timetable states, from docs/08 §3 values: heats of 10 min, 2 min between heats, 3 min between rounds, first heat pinned at 10:00 (Cairo = UTC+3 in October 2026 has no DST: UTC+3).
const heat = (n: number, patch: Partial<TimetableHeat> = {}): TimetableHeat => ({
  id: `h${n}`,
  division_id: "d1",
  round_id: "r1",
  number: n,
  suffix: null,
  name: null,
  status: "scheduled",
  effective_status: "scheduled",
  held: false,
  started_at: null,
  ended_at: null,
  paused_at: null,
  paused_total_sec: 0,
  duration_sec: 600,
  warm_up_sec: 0,
  rerun_of: null,
  round_last: false,
  break_after_heat_min: 2,
  break_after_round_min: 3,
  ...patch,
});

function payload(heats: TimetableHeat[], plan: Record<string, unknown> = {}): PublicTimetable {
  return {
    allowed: true,
    server_now: "2026-10-10T06:00:00Z",
    timezone: "Africa/Cairo",
    poll_sec: 7,
    ready_call_min: 15,
    plans: [
      {
        id: "p1",
        day: "2026-10-10",
        name: "Main",
        items: heats.map((h) => ({ id: `i${h.number}`, kind: "heat", heatId: h.id })),
        anchors: { i1: "10:00" },
        actual_starts: {},
        hold: null,
        defaults: { breakAfterHeatMin: 2, breakAfterRoundMin: 3, readyCallMin: 99 }, // a value stored on the run order is ignored
        ...plan,
      },
    ],
    divisions: [{ id: "d1", name: "Pro Men", sort_order: 1 }],
    rounds: [{ id: "r1", division_id: "d1", name: "Round 1", short_name: "R1", sort_order: 1 }],
    heats,
  };
}

const at = (hhmm: string) => `2026-10-10T${String(Number(hhmm.slice(0, 2)) - 3).padStart(2, "0")}:${hhmm.slice(3)}:00Z`;

describe("the public timetable", () => {
  it("before the first heat: the first is next and pinned-or-estimated, the second is an estimate, and the ready call is 15 min before", () => {
    const t = buildPublicTimetable(payload([heat(1), heat(2), heat(3)]), at("09:00"));
    expect(t.isToday).toBe(true);
    expect(t.rows.map((r) => [r.start, r.status])).toEqual([["10:00", "next"], ["10:12", "est"], ["10:24", "est"]]);
    expect(t.rows[0].title).toBe("Pro Men · R1 · Heat 1");
    expect(t.rows[0].readyCall).toBe("09:45");
    expect(t.rows.map((r) => r.estimated)).toEqual([true, true, true]);
    expect(t.now).toBeNull();
    expect(t.upNext.map((r) => r.heat)).toEqual(["Heat 1", "Heat 2"]);
    expect(t.heatsLeft).toBe(3);
  });

  it("the ready call comes from the event's setting, not from the run order: 20 minutes before 10:00 is 09:40", () => {
    const t = buildPublicTimetable({ ...payload([heat(1), heat(2)]), ready_call_min: 20 }, at("09:00"));
    expect(t.rows[0].readyCall).toBe("09:40");
  });

  it("a running heat is live and exact; the heat after it moves with the real start; finished heats are done", () => {
    const t = buildPublicTimetable(
      payload([heat(1, { status: "ended", started_at: at("10:01"), ended_at: at("10:11") }), heat(2, { status: "running", started_at: at("10:14") }), heat(3), heat(4)]),
      at("10:20"),
    );
    expect(t.rows.map((r) => r.status)).toEqual(["done", "live", "next", "est"]);
    expect(t.now?.heat).toBe("Heat 2");
    expect(t.rows[1].estimated).toBe(false);
    expect(t.rows[2].start).toBe("10:26");
    expect(t.upNext.map((r) => r.heat)).toEqual(["Heat 3", "Heat 4"]);
  });

  it("a pin is shown as pinned (not before) and is not marked as an estimate", () => {
    const t = buildPublicTimetable(payload([heat(1, { status: "ended", started_at: at("10:00"), ended_at: at("10:10") }), heat(2), heat(3)], { anchors: { i1: "10:00", i3: "11:30" } }), at("10:12"));
    expect(t.rows.map((r) => r.status)).toEqual(["done", "next", "pinned"]);
    expect(t.rows[2]).toMatchObject({ start: "11:30", estimated: false });
  });

  it("a wind hold shows every heat that has not started as held, with no time, and says so", () => {
    const t = buildPublicTimetable(payload([heat(1, { status: "ended", started_at: at("10:00"), ended_at: at("10:10") }), heat(2), heat(3)], { hold: { since: "2026-10-10T07:15:00Z", reason: "wind" } }), at("10:20"));
    expect(t.onHold).toBe(true);
    expect(t.rows.map((r) => r.status)).toEqual(["done", "held", "held"]);
    expect(t.rows[1].start).toBeNull();
    expect(t.finish).toBeNull();
  });

  it("a cancelled heat that never started is not listed and takes no time (the re-run takes its place)", () => {
    const t = buildPublicTimetable(payload([heat(1, { status: "cancelled" }), heat(2), heat(3)], { anchors: { i2: "10:00" } }), at("09:00"));
    expect(t.rows.map((r) => r.heat)).toEqual(["Heat 2", "Heat 3"]);
    expect(t.rows.map((r) => r.start)).toEqual(["10:00", "10:12"]);
  });

  it("a heat with no length, and a row whose heat has left the draw, are not shown to the public (they are the organiser's to fix) and do not stop the rest of the day", () => {
    const t = buildPublicTimetable(payload([heat(1), heat(2, { duration_sec: 0 }), heat(3)], { items: [{ id: "i1", kind: "heat", heatId: "h1" }, { id: "i2", kind: "heat", heatId: "h2" }, { id: "i3", kind: "heat", heatId: "h3" }, { id: "i4", kind: "heat", heatId: "gone" }] }), at("09:00"));
    expect(t.rows.map((r) => r.heat)).toEqual(["Heat 1", "Heat 3"]);
    expect(t.rows[1].start).toBe("10:14"); // the engine still counts the empty row's break
  });

  it("a heat that ran but whose result is held back says so", () => {
    const t = buildPublicTimetable(payload([heat(1, { status: "published", held: true, started_at: at("10:00"), ended_at: at("10:10") }), heat(2)]), at("10:12"));
    expect(t.rows[0]).toMatchObject({ status: "done", resultHeld: true });
    expect(t.rows[1].resultHeld).toBe(false);
  });

  it("the day is today's run order, else the nearest day with one; a damaged or missing plan gives an empty page, never an error", () => {
    const later = payload([heat(1)]);
    const t = buildPublicTimetable(later, "2026-10-12T06:00:00Z");
    expect(t.day).toBe("2026-10-10");
    expect(t.isToday).toBe(false);
    expect(buildPublicTimetable(payload([heat(1)], { items: "nonsense" }), at("09:00")).rows).toEqual([]);
    expect(buildPublicTimetable(null, at("09:00")).rows).toEqual([]);
    expect(buildPublicTimetable({ ...later, plans: [] }, at("09:00")).day).toBeNull();
  });

  it("re-run heats and names: a named heat shows its name, a re-run shows its suffix", () => {
    const t = buildPublicTimetable(payload([heat(1, { name: "Semi 1" }), heat(2, { suffix: "R" })]), at("09:00"));
    expect(t.rows.map((r) => r.heat)).toEqual(["Semi 1", "Heat 2R"]);
  });
});

describe("running about N minutes late", () => {
  it("before the first heat the day is on schedule", () => {
    expect(buildPublicTimetable(payload([heat(1), heat(2)]), at("09:00")).drift).toMatchObject({ state: "on_schedule", minutes: 0 });
  });
  it("heat 1 started 6 minutes late: the next heat is about 6 minutes late (plan 10:12, now 10:18)", () => {
    const t = buildPublicTimetable(payload([heat(1, { status: "running", started_at: at("10:06") }), heat(2), heat(3)]), at("10:07"));
    expect(t.drift).toMatchObject({ state: "late", minutes: 6, tone: "amber" });
  });
  it("no drift once every heat has run", () => {
    const done = (n: number, from: string, to: string) => heat(n, { status: "published", started_at: at(from), ended_at: at(to) });
    expect(buildPublicTimetable(payload([done(1, "10:00", "10:10"), done(2, "10:12", "10:22")]), at("10:30")).drift).toBeNull();
  });

  it("Polish 3: in a simulation at x10 the next heat's time is the console's break countdown (the gap after the last heat is a tenth as long); at x1 nothing changes", () => {
    // Heat 1 ran 10:00 to 10:10:30; the break is 2 minutes: 10:12:30 at x1, 10:10:42 at x10
    const heats = (scale: number) => [heat(1, { status: "ended", started_at: "2026-10-10T07:00:00Z", ended_at: "2026-10-10T07:10:30Z", time_scale: scale }), heat(2), heat(3)];
    const x1 = buildPublicTimetable(payload(heats(1)), "2026-10-10T07:10:35Z");
    const x10 = buildPublicTimetable(payload(heats(10)), "2026-10-10T07:10:35Z");
    expect(x1.upNext[0].startUtc).toBe("2026-10-10T07:12:30.000Z");
    expect(x10.upNext[0].startUtc).toBe("2026-10-10T07:10:42.000Z");
    expect(x10.upNext[0].start).toBe("10:10");
    expect(x10.upNext[0].heat).toBe("Heat 2");
  });
});
