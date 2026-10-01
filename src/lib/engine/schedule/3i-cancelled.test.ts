// Phase 5c — a cancelled heat in the run order (docs/08 §1H-10): one that ran keeps its real times, one that never started takes no time.
import { describe, expect, it } from "vitest";
import type { SchedulePlan } from "@/lib/schemas/schedule";
import { computeTimetable } from "./timetable";
import { at, DAY, TZ } from "./fixtures";
import type { HeatLive } from "./types";

const defaults = { breakAfterHeatMin: 2, breakAfterRoundMin: 2, readyCallMin: 15 };
const heat = (n: string, extra: Partial<HeatLive> = {}): HeatLive => ({ heatId: n, division: "Pro Men", round: "R1", heat: `Heat ${n}`, durationMin: 10, warmUpMin: 5, breakAfterHeatMin: 2, breakAfterRoundMin: 2, ...extra });
const plan = (ids: string[], anchors: Record<string, string> = { "i-H1": "10:00" }): SchedulePlan => ({ id: "p", name: "A", active: true, anchors, actualStarts: {}, items: ids.map((id) => ({ id: `i-${id}`, kind: "heat" as const, heatId: id })) });

describe("a cancelled heat in the run order (heat 10, break 2, warm-up 5)", () => {
  it("H3 started 10:34, cancelled 10:40 → H3R warm-up 10:42, start 10:47, end 10:57; H4 starts 11:04", () => {
    const heats = [
      heat("H1", { startedAt: at("10:00"), endedAt: at("10:10") }),
      heat("H2", { startedAt: at("10:17"), endedAt: at("10:27") }),
      heat("H3", { startedAt: at("10:34"), endedAt: at("10:40"), cancelled: true }),
      heat("H3R"),
      heat("H4"),
    ];
    const t = computeTimetable(plan(["H1", "H2", "H3", "H3R", "H4"]), heats, { timezone: TZ, eventDay: DAY, defaults, now: at("10:41") });
    const row = (id: string) => t.rows.find((r) => r.heatId === id)!;
    expect(row("H3")).toMatchObject({ status: "cancelled", start: "10:34", end: "10:40" });
    expect(row("H3R")).toMatchObject({ warmUpStart: "10:42", start: "10:47", end: "10:57" });
    expect(row("H4").start).toBe("11:04");
  });

  it("a cancelled heat that never started takes no time and shows no times", () => {
    const heats = [heat("H1"), heat("H2", { cancelled: true }), heat("H3")];
    const t = computeTimetable(plan(["H1", "H2", "H3"]), heats, { timezone: TZ, eventDay: DAY, defaults });
    const row = (id: string) => t.rows.find((r) => r.heatId === id)!;
    expect(row("H2")).toMatchObject({ status: "cancelled", start: null, end: null });
    expect(row("H3").start).toBe("10:17"); // as if H2 were not there
    expect(t.heatsLeft).toBe(2);
  });
});
