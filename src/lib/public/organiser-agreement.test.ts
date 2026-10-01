import { describe, expect, it } from "vitest";
import { computeTimetable } from "@/lib/engine/schedule";
import { buildHeatModel, type HeatRowDb } from "@/lib/schedule/model";
import { rowToPlan } from "@/lib/schedule/plans";
import { buildPublicTimetable } from "./timetable";
import type { PublicTimetable } from "./types";

// After a Re-run the organiser's timetable and the public one must give the same times: the cancelled heat that never started takes no time on both.
describe("the organiser's estimates and the public ones agree after a re-run", () => {
  const plan = { id: "p", event_id: "e", day: "2026-10-10", name: "Main", active: true, hold: null, actual_starts: {}, defaults: { breakAfterHeatMin: 2, breakAfterRoundMin: 3 }, anchors: { i2: "10:00" }, items: [1, 2, 3, 4].map((n) => ({ id: `i${n}`, kind: "heat", heatId: `h${n}` })) };
  const rows: HeatRowDb[] = [1, 2, 3, 4].map((n) => ({ id: `h${n}`, division_id: "d", round_id: "r", draw_uid: null, number: n, name: null, status: n === 1 ? "cancelled" : "scheduled", started_at: null, ended_at: null, duration_sec: 600, warm_up_sec: 0, paused_total_sec: 0 }));
  const now = "2026-10-10T06:00:00Z"; // 09:00 in Cairo

  it("same start times, 10:00, 10:12, 10:24, with the ready call from the one event setting", () => {
    const model = buildHeatModel([{ id: "d", name: "Pro", sort_order: 1, draw: null }], [{ id: "r", division_id: "d", name: "Round 1", short_name: "R1", sort_order: 1 }], rows);
    const { plan: p, defaults } = rowToPlan(plan, 15);
    const organiser = computeTimetable(p, model.lives, { timezone: "Africa/Cairo", eventDay: plan.day, defaults, now });
    const organiserTimes = organiser.rows.filter((r) => r.status !== "cancelled").map((r) => [r.heat, r.start, r.readyCall]);
    const payload: PublicTimetable = {
      allowed: true, server_now: now, timezone: "Africa/Cairo", poll_sec: 7, ready_call_min: 15,
      plans: [{ id: "p", day: plan.day, name: "Main", items: plan.items, anchors: plan.anchors, actual_starts: {}, hold: null, defaults: plan.defaults }],
      divisions: [{ id: "d", name: "Pro", sort_order: 1 }], rounds: [{ id: "r", division_id: "d", name: "Round 1", short_name: "R1", sort_order: 1 }],
      heats: rows.map((h) => ({ id: h.id, division_id: "d", round_id: "r", number: h.number, suffix: null, name: null, status: h.status, effective_status: h.status, held: false, started_at: null, ended_at: null, paused_at: null, paused_total_sec: 0, duration_sec: 600, warm_up_sec: 0, rerun_of: null, round_last: h.number === 4, break_after_heat_min: null, break_after_round_min: null })),
    };
    const pub = buildPublicTimetable(payload, now).rows.map((r) => [r.heat, r.start, r.readyCall]);
    expect(organiserTimes).toEqual([["Heat 2", "10:00", "09:45"], ["Heat 3", "10:12", "09:57"], ["Heat 4", "10:24", "10:09"]]);
    expect(pub).toEqual(organiserTimes);
  });
});
