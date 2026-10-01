import { describe, expect, it } from "vitest";
import { activePlanFor, heatLabel, heatTitle, livesFor, type ActivePlan } from "./run-order";
import type { HeatRow } from "./types";

const heat = (patch: Partial<HeatRow> = {}): HeatRow => ({
  id: "h", division_id: "d1", round_id: "r1", number: 3, number_suffix: null, name: null, status: "scheduled", duration_sec: 600, warm_up_sec: 120,
  started_at: null, paused_at: null, paused_total_sec: 90, ended_at: null, draw_uid: null, updated_at: "", ...patch,
});
const ctx = { divisions: [{ id: "d1", name: "Pro Men" }] as never, rounds: [{ id: "r1", division_id: "d1", name: "Round 1", short_name: "R1", sort_order: 1 }] };
const plan = (id: string, day: string): ActivePlan => ({ id, day, plan: { id, name: id, active: true, items: [], anchors: {}, actualStarts: {} } as never, defaults: {} as never, updatedAt: "" });

describe("run order helpers", () => {
  it("names a heat the way the head judge reads it", () => {
    expect(heatLabel(heat())).toBe("Heat 3");
    expect(heatLabel(heat({ number_suffix: "R" }))).toBe("Heat 3R");
    expect(heatLabel(heat({ name: "Semi-final 1" }))).toBe("Semi-final 1");
    expect(heatTitle(ctx, heat())).toBe("Pro Men · R1 · Heat 3");
  });
  it("gives the timetable engine the server times and the minutes", () => {
    const [l] = livesFor(ctx, [heat({ started_at: "2026-10-01T10:00:00Z" })], { h: { roundLast: true, breakAfterHeatMin: 3 } });
    expect(l).toMatchObject({ heatId: "h", division: "Pro Men", round: "Round 1", heat: "Heat 3", startedAt: "2026-10-01T10:00:00Z", pausedMin: 1.5, durationMin: 10, warmUpMin: 2, roundLast: true, breakAfterHeatMin: 3 });
  });
  it("picks today's active plan, else the nearest day", () => {
    const now = Date.parse("2026-10-02T09:00:00Z");
    expect(activePlanFor([plan("a", "2026-10-01"), plan("b", "2026-10-02")], "Africa/Cairo", now)?.id).toBe("b");
    expect(activePlanFor([plan("a", "2026-10-01"), plan("c", "2026-10-09")], "Africa/Cairo", now)?.id).toBe("a");
    expect(activePlanFor([], "Africa/Cairo", now)).toBeNull();
  });
});
