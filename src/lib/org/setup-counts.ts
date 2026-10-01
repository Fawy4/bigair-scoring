import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { loadPanelOverview } from "./panel-overview";
import { panelShortfalls } from "@/lib/officials/panel-check";
import type { SetupCounts } from "@/lib/wizard/status";
import { createServiceClient } from "@/lib/supabase/service";
import { todayIn } from "@/lib/schedule/plans";

/** Riders taking part per division, judge seats, seats waiting for approval, and the panels that are short of judges. */
export async function loadSetupCounts(supabase: SupabaseClient<Database>, eventId: string, timezone = "Africa/Cairo"): Promise<SetupCounts> {
  const [{ data: entries }, { data: seats }, { data: heats }, { data: divs }, { data: plans }] = await Promise.all([
    supabase.from("entries").select("division_id, status").eq("event_id", eventId),
    supabase.from("judge_seats").select("id, role, status").eq("event_id", eventId),
    supabase.from("heats").select("division_id").eq("event_id", eventId),
    supabase.from("divisions").select("id, draw_locked_at").eq("event_id", eventId),
    supabase.from("schedule_plans").select("id, day, active").eq("event_id", eventId),
  ]);
  const ridersByDivision: Record<string, number> = {};
  for (const e of entries ?? []) if (e.status === "confirmed") ridersByDivision[e.division_id] = (ridersByDivision[e.division_id] ?? 0) + 1;

  const overview = await loadPanelOverview(supabase, eventId);
  const shortfalls = panelShortfalls(overview.filter((d) => d.hasScoringModel).map((d) => ({ name: d.name, minJudges: d.minJudges, assigned: d.seatIds.length })));
  // Which active seats have a PIN that can be shown. pin_enc is never granted to organisers' browsers, so the check runs on the server for seats the organiser's own session already returned.
  const activeIds = (seats ?? []).filter((s) => s.status === "active").map((s) => s.id);
  let seatsWithoutPin = 0;
  if (activeIds.length > 0) {
    const { data: withPin } = await createServiceClient().from("judge_seats").select("id").in("id", activeIds).not("pin_enc", "is", null);
    seatsWithoutPin = activeIds.length - (withPin ?? []).length;
  }
  const today = todayIn(timezone, Date.now());
  const activePlans = (plans ?? []).filter((p) => p.active);
  return {
    ridersByDivision,
    judgeSeats: (seats ?? []).filter((s) => s.role === "judge" && s.status === "active").length,
    pendingSeats: (seats ?? []).filter((s) => s.status === "pending").length,
    panelShortfalls: shortfalls,
    drawn: [...new Set((heats ?? []).map((h) => h.division_id))],
    locked: (divs ?? []).filter((d) => d.draw_locked_at).map((d) => d.id),
    activePlan: activePlans.length > 0,
    activePlanToday: activePlans.some((p) => p.day === today),
    planCount: (plans ?? []).length,
    seatCount: (seats ?? []).length,
    seatsWithoutPin,
    panels: overview.map((d) => ({ id: d.id, name: d.name, minJudges: d.minJudges, assigned: d.seatIds.length, hasScoringModel: d.hasScoringModel })),
  };
}
