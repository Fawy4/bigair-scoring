import type { SupabaseClient } from "@supabase/supabase-js";
import { applyHeatStatuses } from "@/lib/draw/entrants";
import { drawProjection } from "@/lib/draw/projection";
import { withdrawEntrant, type DivisionDraw } from "@/lib/engine/ladder";

/** A seat's change for a later heat, in the shape set_draw_walkover (and publish) takes. */
export interface SeatChange {
  uid: string;
  slots: Array<{ position: number; entry_id: string | null; modifier: string | null }>;
}

/**
 * Fix 2 / A1b-3: a rider who is set to Withdrawn (or No-show) after the draw is locked keeps the seat as a walkover (docs/04 decisions 13 and 36). The draw comes from the
 * engine; the seats the engine changed (a final's seat that now fills, a rider left alone in a heat who moves on) are returned the way a publish returns them. Pure.
 */
export function walkoverPlan(draw: DivisionDraw, heats: ReadonlyArray<{ draw_uid: string | null; status: string; started_at?: string | null }>, entryId: string): { draw: DivisionDraw; seats: SeatChange[] } {
  const synced = applyHeatStatuses(draw, heats);
  const next = withdrawEntrant(synced, entryId);
  const before = new Map(drawProjection(synced).heats.map((h) => [h.uid, h]));
  const key = (s: { entry_id: string | null; modifier: string | null }) => `${s.entry_id ?? ""}|${s.modifier ?? ""}`;
  const seats = drawProjection(next)
    .heats.filter((h) => (before.get(h.uid)?.slots ?? []).map(key).join(",") !== h.slots.map(key).join(","))
    .map((h) => ({ uid: h.uid, slots: h.slots.map((s) => ({ position: s.position, entry_id: s.entry_id, modifier: s.modifier })) }));
  return { draw: next, seats };
}

export type WithdrawResult = { ok: true; changed: number; walkovers: number } | { ok: false; code: "HEAT_STARTED" | "FAILED" };

/**
 * Sets the riders' status and, for a division whose draw is locked, turns each withdrawn or no-show rider's seat into a walkover. Refuses (changing nothing) when a withdrawn
 * rider's heat has started: from then on it is the head judge's Did not start. Called by the Riders step; works with the organiser's own session (the database checks the rights).
 */
export async function setEntryStatus(supabase: SupabaseClient, entryIds: string[], status: "confirmed" | "withdrawn" | "no_show"): Promise<WithdrawResult> {
  const { data: entries } = await supabase.from("entries").select("id, division_id").in("id", entryIds);
  if (!entries?.length) return { ok: true, changed: 0, walkovers: 0 };
  const withdrawing = status !== "confirmed";
  type Job = { division: string; entry: string };
  const jobs: Job[] = [];
  if (withdrawing) {
    const divisionIds = [...new Set(entries.map((e) => e.division_id))];
    const { data: divisions } = await supabase.from("divisions").select("id, draw, draw_locked_at").in("id", divisionIds);
    for (const dv of divisions ?? []) {
      const draw = dv.draw as unknown as DivisionDraw | null;
      if (!dv.draw_locked_at || !draw) continue;
      for (const e of entries.filter((x) => x.division_id === dv.id)) {
        if (!draw.entrants.some((x) => x.id === e.id && !x.withdrawn)) continue;
        const { data: seat } = await supabase.from("heat_slots").select("heat_id, heats!inner(status, started_at)").eq("entry_id", e.id).limit(1);
        const heat = (seat?.[0] as unknown as { heats: { status: string; started_at: string | null } } | undefined)?.heats;
        if (heat && (heat.status !== "scheduled" || heat.started_at)) return { ok: false, code: "HEAT_STARTED" };
        jobs.push({ division: dv.id, entry: e.id });
      }
    }
  }
  const { data: changed, error } = await supabase.from("entries").update({ status }).in("id", entryIds).select("id");
  if (error) return { ok: false, code: "FAILED" };
  let walkovers = 0;
  for (const job of jobs) {
    // read the draw again for each rider: the one before may have changed it
    const { data: dv } = await supabase.from("divisions").select("draw").eq("id", job.division).single();
    const { data: heats } = await supabase.from("heats").select("draw_uid, status, started_at").eq("division_id", job.division);
    const plan = walkoverPlan(dv!.draw as unknown as DivisionDraw, heats ?? [], job.entry);
    const { error: e } = await supabase.rpc("set_draw_walkover", { p_division: job.division, p_entry: job.entry, p_draw: plan.draw as never, p_projection: plan.seats as never });
    if (e) return { ok: false, code: "FAILED" };
    walkovers++;
  }
  return { ok: true, changed: changed?.length ?? 0, walkovers };
}
