import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { minJudgesFor } from "@/lib/officials/panels";
import { panelShortfalls } from "@/lib/officials/panel-check";
import type { SetupCounts } from "@/lib/wizard/status";

/** Riders taking part per division, judge seats, seats waiting for approval, and the panels that are short of judges. */
export async function loadSetupCounts(supabase: SupabaseClient<Database>, eventId: string): Promise<SetupCounts> {
  const [{ data: entries }, { data: seats }, { data: divisions }] = await Promise.all([
    supabase.from("entries").select("division_id, status").eq("event_id", eventId),
    supabase.from("judge_seats").select("id, role, status").eq("event_id", eventId),
    supabase.from("divisions").select("id, name, panel_id, scoring_model_id, scoring_overrides").eq("event_id", eventId).order("sort_order"),
  ]);
  const ridersByDivision: Record<string, number> = {};
  for (const e of entries ?? []) if (e.status === "confirmed") ridersByDivision[e.division_id] = (ridersByDivision[e.division_id] ?? 0) + 1;

  const modelIds = [...new Set((divisions ?? []).map((d) => d.scoring_model_id).filter((x): x is string => Boolean(x)))];
  const panelIds = [...new Set((divisions ?? []).map((d) => d.panel_id).filter((x): x is string => Boolean(x)))];
  const [{ data: models }, { data: members }] = await Promise.all([
    modelIds.length ? supabase.from("scoring_models").select("id, json").in("id", modelIds) : Promise.resolve({ data: [] as { id: string; json: unknown }[] }),
    panelIds.length ? supabase.from("panel_members").select("panel_id").in("panel_id", panelIds) : Promise.resolve({ data: [] as { panel_id: string }[] }),
  ]);
  const modelJson = new Map((models ?? []).map((m) => [m.id, m.json]));
  const assigned = new Map<string, number>();
  for (const m of members ?? []) assigned.set(m.panel_id, (assigned.get(m.panel_id) ?? 0) + 1);

  const shortfalls = panelShortfalls(
    (divisions ?? [])
      .filter((d) => d.scoring_model_id)
      .map((d) => ({ name: d.name, minJudges: minJudgesFor(modelJson.get(d.scoring_model_id!), d.scoring_overrides), assigned: d.panel_id ? (assigned.get(d.panel_id) ?? 0) : 0 })),
  );
  return {
    ridersByDivision,
    judgeSeats: (seats ?? []).filter((s) => s.role === "judge" && s.status === "active").length,
    pendingSeats: (seats ?? []).filter((s) => s.status === "pending").length,
    panelShortfalls: shortfalls,
  };
}
