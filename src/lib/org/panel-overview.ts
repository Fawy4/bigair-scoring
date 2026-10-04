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

/** One division as the overview reads it: its panel's members and its scoring model's rules come with it (one request, no second look-up). */
export const PANEL_DIVISION_COLUMNS = "id, name, panel_id, scoring_model_id, scoring_overrides, scoring_models(json), panels(panel_members(judge_seat_id, seat_no))";

export interface PanelDivisionRow {
  id: string;
  name: string;
  panel_id: string | null;
  scoring_model_id: string | null;
  scoring_overrides: unknown;
  scoring_models: { json: unknown } | null;
  panels: { panel_members: Array<{ judge_seat_id: string; seat_no: number }> } | null;
}

/** The overview from the rows of `PANEL_DIVISION_COLUMNS`, divisions in the order given. */
export function panelOverviewFrom(divisions: readonly PanelDivisionRow[]): PanelOverview[] {
  return divisions.map((d) => ({
    id: d.id,
    name: d.name,
    panelId: d.panel_id,
    hasScoringModel: Boolean(d.scoring_model_id),
    minJudges: minJudgesFor(d.scoring_model_id ? d.scoring_models?.json : null, d.scoring_overrides),
    seatIds: [...(d.panels?.panel_members ?? [])].sort((a, b) => a.seat_no - b.seat_no).map((m) => m.judge_seat_id),
  }));
}

/** Every division of an event with how many judges its scoring rules ask for and who is on its panel. One request. */
export async function loadPanelOverview(supabase: SupabaseClient<Database>, eventId: string): Promise<PanelOverview[]> {
  const { data } = await supabase.from("divisions").select(PANEL_DIVISION_COLUMNS).eq("event_id", eventId).order("sort_order").order("created_at");
  return panelOverviewFrom((data ?? []) as unknown as PanelDivisionRow[]);
}
