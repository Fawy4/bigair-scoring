import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { panelOverviewFrom, PANEL_DIVISION_COLUMNS, type PanelDivisionRow } from "./panel-overview";
import { panelShortfalls } from "@/lib/officials/panel-check";
import type { SetupCounts } from "@/lib/wizard/status";
import { createServiceClient } from "@/lib/supabase/service";
import { todayIn } from "@/lib/schedule/plans";

/** The rows the set-up counts are worked out from, all asked for at the same time. */
export async function loadSetupRows(supabase: SupabaseClient<Database>, eventId: string) {
  const [{ data: entries }, { data: seats }, { data: heats }, { data: divs }, { data: plans }, { data: withoutPin }] = await Promise.all([
    supabase.from("entries").select("division_id, status").eq("event_id", eventId),
    supabase.from("judge_seats").select("id, role, status").eq("event_id", eventId),
    supabase.from("heats").select("division_id").eq("event_id", eventId),
    supabase.from("divisions").select(`${PANEL_DIVISION_COLUMNS}, draw_locked_at, format_template_id`).eq("event_id", eventId).order("sort_order").order("created_at"),
    supabase.from("schedule_plans").select("id, day, active").eq("event_id", eventId),
    createServiceClient().from("judge_seats").select("id").eq("event_id", eventId).eq("status", "active").is("pin_enc", null),
  ]);
  return {
    entries: entries ?? [],
    seats: seats ?? [],
    heats: heats ?? [],
    divisions: (divs ?? []) as unknown as Array<PanelDivisionRow & { draw_locked_at: string | null; format_template_id: string | null }>,
    plans: plans ?? [],
    withoutPin: withoutPin ?? [],
  };
}
export type SetupRows = Awaited<ReturnType<typeof loadSetupRows>>;

/**
 * Riders taking part per division, judge seats, seats waiting for approval, and the panels that are short of judges, from `loadSetupRows` (one round: the divisions come
 * with their panel's members and scoring rules, and the PIN check does not wait for the seat list. pin_enc is never granted to organisers' browsers, so that check runs
 * on the server with the server's key, event-wide, and only the seats the organiser's own session returned are counted).
 */
export function setupCountsFrom(rows: SetupRows, timezone = "Africa/Cairo"): SetupCounts {
  const { entries, seats, heats, divisions: divisionRows, plans, withoutPin } = rows;
  const ridersByDivision: Record<string, number> = {};
  for (const e of entries) if (e.status === "confirmed") ridersByDivision[e.division_id] = (ridersByDivision[e.division_id] ?? 0) + 1;

  const overview = panelOverviewFrom(divisionRows);
  const shortfalls = panelShortfalls(overview.filter((d) => d.hasScoringModel).map((d) => ({ name: d.name, minJudges: d.minJudges, assigned: d.seatIds.length })));
  const noPin = new Set(withoutPin.map((s) => s.id));
  const seatsWithoutPin = seats.filter((s) => s.status === "active" && noPin.has(s.id)).length;
  const today = todayIn(timezone, Date.now());
  const activePlans = plans.filter((p) => p.active);
  return {
    ridersByDivision,
    judgeSeats: seats.filter((s) => s.role === "judge" && s.status === "active").length,
    pendingSeats: seats.filter((s) => s.status === "pending").length,
    panelShortfalls: shortfalls,
    drawn: [...new Set(heats.map((h) => h.division_id))],
    locked: divisionRows.filter((d) => d.draw_locked_at).map((d) => d.id),
    activePlan: activePlans.length > 0,
    activePlanToday: activePlans.some((p) => p.day === today),
    today,
    activePlanDays: [...new Set(activePlans.map((p) => p.day))].sort(),
    planCount: plans.length,
    seatCount: seats.length,
    seatsWithoutPin,
    panels: overview.map((d) => ({ id: d.id, name: d.name, minJudges: d.minJudges, assigned: d.seatIds.length, hasScoringModel: d.hasScoringModel })),
  };
}

/** Both at once, for a caller that already knows the event's time zone. */
export async function loadSetupCounts(supabase: SupabaseClient<Database>, eventId: string, timezone = "Africa/Cairo"): Promise<SetupCounts> {
  return setupCountsFrom(await loadSetupRows(supabase, eventId), timezone);
}
