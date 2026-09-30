import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { loadPanelOverview } from "./panel-overview";
import { panelShortfalls } from "@/lib/officials/panel-check";
import type { SetupCounts } from "@/lib/wizard/status";

/** Riders taking part per division, judge seats, seats waiting for approval, and the panels that are short of judges. */
export async function loadSetupCounts(supabase: SupabaseClient<Database>, eventId: string): Promise<SetupCounts> {
  const [{ data: entries }, { data: seats }, { data: heats }, { data: divs }, { data: plans }] = await Promise.all([
    supabase.from("entries").select("division_id, status").eq("event_id", eventId),
    supabase.from("judge_seats").select("id, role, status").eq("event_id", eventId),
    supabase.from("heats").select("division_id").eq("event_id", eventId),
    supabase.from("divisions").select("id, draw_locked_at").eq("event_id", eventId),
    supabase.from("schedule_plans").select("id").eq("event_id", eventId).eq("active", true),
  ]);
  const ridersByDivision: Record<string, number> = {};
  for (const e of entries ?? []) if (e.status === "confirmed") ridersByDivision[e.division_id] = (ridersByDivision[e.division_id] ?? 0) + 1;

  const overview = await loadPanelOverview(supabase, eventId);
  const shortfalls = panelShortfalls(overview.filter((d) => d.hasScoringModel).map((d) => ({ name: d.name, minJudges: d.minJudges, assigned: d.seatIds.length })));
  return {
    ridersByDivision,
    judgeSeats: (seats ?? []).filter((s) => s.role === "judge" && s.status === "active").length,
    pendingSeats: (seats ?? []).filter((s) => s.status === "pending").length,
    panelShortfalls: shortfalls,
    drawn: [...new Set((heats ?? []).map((h) => h.division_id))],
    locked: (divs ?? []).filter((d) => d.draw_locked_at).map((d) => d.id),
    activePlan: (plans ?? []).length > 0,
  };
}
