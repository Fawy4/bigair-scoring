import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { minJudgesFor } from "@/lib/officials/panels";

export interface PanelOverview {
  id: string;
  name: string;
  panelId: string | null;
  minJudges: number;
  /** Seats on this division's panel, in seat order. */
  seatIds: string[];
  hasScoringModel: boolean;
}

/** Every division of an event with how many judges its scoring rules ask for and who is on its panel. */
export async function loadPanelOverview(supabase: SupabaseClient<Database>, eventId: string): Promise<PanelOverview[]> {
  const { data: divisions } = await supabase.from("divisions").select("id, name, panel_id, scoring_model_id, scoring_overrides").eq("event_id", eventId).order("sort_order").order("created_at");
  const modelIds = [...new Set((divisions ?? []).map((d) => d.scoring_model_id).filter((x): x is string => Boolean(x)))];
  const panelIds = [...new Set((divisions ?? []).map((d) => d.panel_id).filter((x): x is string => Boolean(x)))];
  const [{ data: models }, { data: members }] = await Promise.all([
    modelIds.length ? supabase.from("scoring_models").select("id, json").in("id", modelIds) : Promise.resolve({ data: [] as { id: string; json: unknown }[] }),
    panelIds.length ? supabase.from("panel_members").select("panel_id, judge_seat_id, seat_no").in("panel_id", panelIds).order("seat_no") : Promise.resolve({ data: [] as { panel_id: string; judge_seat_id: string; seat_no: number }[] }),
  ]);
  const json = new Map((models ?? []).map((m) => [m.id, m.json]));
  return (divisions ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    panelId: d.panel_id,
    hasScoringModel: Boolean(d.scoring_model_id),
    minJudges: minJudgesFor(d.scoring_model_id ? json.get(d.scoring_model_id) : null, d.scoring_overrides),
    seatIds: (members ?? []).filter((m) => m.panel_id === d.panel_id).map((m) => m.judge_seat_id),
  }));
}
