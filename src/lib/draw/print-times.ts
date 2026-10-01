import type { SupabaseClient } from "@supabase/supabase-js";
import { computeTimetable } from "@/lib/engine/schedule";
import { buildHeatModel, type DivisionRowDb, type HeatRowDb, type RoundRowDb } from "@/lib/schedule/model";
import { rowToPlan, todayIn, type PlanRow } from "@/lib/schedule/plans";
import type { Database } from "@/lib/supabase/database.types";

export interface DrawTimes {
  /** Start time ("10:05", in the event's time zone) of each heat of the division that the active run order has placed, by the heat's uid. */
  byUid: Record<string, string>;
  /** The day of the first timed heat ("2026-10-02"), or null when the run order has no times for this division. */
  day: string | null;
}

/**
 * The start times the printed draw shows: the active run order of each day, worked out by the same timetable engine as the Run order
 * screen. A division with no heats in any active plan (or a plan with no start yet) simply has none: the draw prints without times.
 */
export async function loadDrawTimes(supabase: SupabaseClient<Database>, eventId: string, divisionId: string, timezone: string): Promise<DrawTimes> {
  const { data: plans } = await supabase.from("schedule_plans").select("id, event_id, day, name, items, anchors, actual_starts, hold, defaults, active").eq("event_id", eventId).eq("active", true).order("day");
  if (!plans || plans.length === 0) return { byUid: {}, day: null };
  const [{ data: divisions }, { data: rounds }, { data: heats }] = await Promise.all([
    supabase.from("divisions").select("id, name, sort_order, draw").eq("event_id", eventId).order("sort_order"),
    supabase.from("rounds").select("id, division_id, name, short_name, sort_order").eq("event_id", eventId),
    supabase.from("heats").select("id, division_id, round_id, draw_uid, number, name, status, started_at, ended_at, duration_sec, warm_up_sec, paused_total_sec").eq("event_id", eventId),
  ]);
  const model = buildHeatModel((divisions ?? []) as DivisionRowDb[], (rounds ?? []) as RoundRowDb[], (heats ?? []) as HeatRowDb[]);
  const uidOf = new Map((heats ?? []).filter((h) => h.division_id === divisionId && h.draw_uid).map((h) => [h.id, h.draw_uid as string]));
  const byUid: Record<string, string> = {};
  let day: string | null = null;
  for (const row of plans) {
    const { plan, defaults } = rowToPlan(row as PlanRow, 0) /* the printed draw shows start times only, never the ready call */;
    const now = todayIn(timezone, Date.now()) === row.day ? new Date().toISOString() : undefined;
    const table = computeTimetable(plan, model.lives, { timezone, eventDay: row.day, defaults, ...(now ? { now } : {}) });
    for (const r of table.rows) {
      if (r.kind !== "heat" || !r.heatId || !r.start) continue;
      const uid = uidOf.get(r.heatId);
      if (!uid) continue;
      byUid[uid] = r.start;
      day = day ?? row.day;
    }
  }
  return { byUid, day };
}
