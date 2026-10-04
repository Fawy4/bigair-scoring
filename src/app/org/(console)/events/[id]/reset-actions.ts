"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/org/context";
import { startingCopy, startingTarget } from "@/lib/reset/plan";
import { copy } from "@/lib/ui-copy";
import type { DivisionDraw } from "@/lib/engine/ladder";

const T = copy.reset;
const uuid = z.string().uuid();

export interface ResetPreview {
  slug: string;
  counts: { heats: number; all_heats: number; reruns: number; attempts: number; scores: number; published_results: number };
  running: string | null;
  everPublic: boolean;
  /** Divisions with no saved starting draw: they are rebuilt from the current draw (Round 1 kept, later seats emptied), not restored from a copy. */
  rebuilt: string[];
}

type Failed = { ok: false; error: string };

/** "HEAT_RUNNING: Heat 3" → the sentence for it. Anything unknown becomes the plain "could not be done". */
function sentence(message: string): string {
  const m = /^([A-Z_]+)(?:: (.*))?$/.exec(message.trim());
  const code = m?.[1] ?? "";
  const detail = m?.[2] ?? "";
  if (code === "HEAT_RUNNING") return T.errors.HEAT_RUNNING(detail);
  if (code === "HEAT_ARMED") return T.errors.HEAT_ARMED;
  const plain: Record<string, string> = { NOT_ALLOWED: T.errors.NOT_ALLOWED, SLUG_MISMATCH: T.errors.SLUG_MISMATCH, REASON_REQUIRED: T.errors.REASON_REQUIRED, BAD_PROJECTION: T.errors.BAD_PROJECTION };
  return plain[code] ?? T.errors.failed;
}

/** What a reset would do, from the database: the counts, a heat that is running, which divisions cannot be reset, and whether a reason is needed. */
export async function previewReset(eventId: string): Promise<{ ok: true; preview: ResetPreview } | Failed> {
  if (!uuid.safeParse(eventId).success) return { ok: false, error: T.errors.failed };
  const { supabase } = await getDb();
  const { data, error } = await supabase.rpc("reset_event_preview", { p_event: eventId });
  if (error || !data) return { ok: false, error: sentence(error?.message ?? "") };
  const d = data as unknown as { slug: string; counts: ResetPreview["counts"]; running: string | null; ever_public: boolean; divisions: Array<{ name: string; drawn: boolean; has_copy: boolean; heat_left_scheduled: boolean }> };
  return {
    ok: true,
    preview: {
      slug: d.slug,
      counts: d.counts,
      running: d.running,
      everPublic: d.ever_public,
      rebuilt: d.divisions.filter((x) => x.drawn && !x.has_copy).map((x) => x.name),
    },
  };
}

const ResetInput = z.object({ eventId: uuid, slug: z.string().max(80), reason: z.string().max(500).optional() });

/** Resets the event: the pure plan makes the target ladder of each division, the database function checks it and writes everything in one transaction. */
export async function resetEvent(input: z.input<typeof ResetInput>): Promise<{ ok: true; counts: ResetPreview["counts"]; rebuilt: string[] } | Failed> {
  const parsed = ResetInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: T.errors.failed };
  const { eventId, slug, reason } = parsed.data;
  const { supabase } = await getDb();
  const { data: divisions, error: divError } = await supabase.from("divisions").select("id, draw, draw_at_lock, draw_locked_at").eq("event_id", eventId).not("draw", "is", null);
  if (divError) return { ok: false, error: T.errors.failed };
  const draws: Array<{ division: string; draw: DivisionDraw; projection: unknown }> = [];
  try {
    for (const d of divisions ?? []) {
      // the starting draw: the copy taken at lock time (or, for a draw that is not locked and untouched, the draw itself); with no copy, the current draw rebuilt
      const current = d.draw as unknown as DivisionDraw;
      const t = startingTarget(startingCopy({ draw: current, draw_at_lock: d.draw_at_lock as unknown as DivisionDraw | null, draw_locked_at: d.draw_locked_at }), current);
      draws.push({ division: d.id, draw: t.draw, projection: t.projection });
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.message === T.rebuildArranged ? e.message : T.errors.failed };
  }
  const { data, error } = await supabase.rpc("reset_event", { p_event: eventId, p_slug: slug, p_reason: reason ?? "", p_draws: draws as never });
  if (error) return { ok: false, error: sentence(error.message) };
  revalidatePath(`/org/events/${eventId}`, "layout");
  const out = data as unknown as ResetPreview["counts"] & { rebuilt?: string[] };
  return { ok: true, counts: out, rebuilt: out.rebuilt ?? [] };
}

/** Platform owners only: brings back what a reset wiped. */
export async function restoreReset(snapshotId: string): Promise<{ ok: true } | Failed> {
  if (!uuid.safeParse(snapshotId).success) return { ok: false, error: T.restore.errors.failed };
  const { supabase } = await getDb();
  const { error } = await supabase.rpc("restore_event_reset", { p_snapshot: snapshotId });
  if (error) {
    const code = /^([A-Z_]+)/.exec(error.message.trim())?.[1] ?? "";
    const errs = T.restore.errors as Record<string, string>;
    return { ok: false, error: errs[code] ?? T.restore.errors.failed };
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

// ------------------------------------------------------------------ reset one division, clear a run order's actual times (Reset per section)
const PT = copy.resetParts;

export interface DivisionResetPreview {
  name: string;
  drawn: boolean;
  /** No saved starting draw: the reset rebuilds it from the current draw. */
  rebuilt: boolean;
  counts: ResetPreview["counts"];
  running: string | null;
  everPublic: boolean;
}

/** What "Reset this division" would do, from the database: counts, who is running, whether it is a rebuild, whether a reason is needed. */
export async function previewResetDivision(divisionId: string): Promise<{ ok: true; preview: DivisionResetPreview } | Failed> {
  if (!uuid.safeParse(divisionId).success) return { ok: false, error: T.errors.failed };
  const { supabase } = await getDb();
  const { data, error } = await supabase.rpc("reset_division_preview", { p_division: divisionId });
  if (error || !data) return { ok: false, error: sentence(error?.message ?? "") };
  const d = data as unknown as { name: string; drawn: boolean; has_copy: boolean; counts: ResetPreview["counts"]; running: string | null; ever_public: boolean };
  return { ok: true, preview: { name: d.name, drawn: d.drawn, rebuilt: d.drawn && !d.has_copy, counts: d.counts, running: d.running, everPublic: d.ever_public } };
}

const DivisionInput = z.object({ divisionId: uuid, reason: z.string().max(500).optional() });

/** Resets one division: the pure plan makes its starting draw (the saved copy, or the rebuild), the database function checks it and writes everything in one transaction. */
export async function resetDivision(input: z.input<typeof DivisionInput>): Promise<{ ok: true; counts: ResetPreview["counts"]; rebuilt: boolean } | Failed> {
  const parsed = DivisionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: T.errors.failed };
  const { divisionId, reason } = parsed.data;
  const { supabase } = await getDb();
  const { data: d, error: readError } = await supabase.from("divisions").select("id, event_id, draw, draw_at_lock, draw_locked_at").eq("id", divisionId).maybeSingle();
  if (readError || !d) return { ok: false, error: T.errors.NOT_ALLOWED };
  if (!d.draw) return { ok: false, error: PT.errors.NO_DRAW };
  let item: { division: string; draw: DivisionDraw; projection: unknown };
  try {
    const current = d.draw as unknown as DivisionDraw;
    const t = startingTarget(startingCopy({ draw: current, draw_at_lock: d.draw_at_lock as unknown as DivisionDraw | null, draw_locked_at: d.draw_locked_at }), current);
    item = { division: d.id, draw: t.draw, projection: t.projection };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.message === T.rebuildArranged ? e.message : T.errors.failed };
  }
  const { data, error } = await supabase.rpc("reset_division", { p_division: divisionId, p_reason: reason ?? "", p_item: item as never });
  if (error) return { ok: false, error: partSentence(error.message) };
  revalidatePath(`/org/events/${d.event_id}`, "layout");
  const out = data as unknown as ResetPreview["counts"] & { rebuilt: boolean };
  return { ok: true, counts: out, rebuilt: out.rebuilt };
}

/** "NOT_ALLOWED", "HEAT_RUNNING: Heat 3"… → the sentence for it (this section's words first, then the event reset's). */
function partSentence(message: string): string {
  const m = /^([A-Z_]+)(?:: (.*))?$/.exec(message.trim());
  const code = m?.[1] ?? "";
  const known = PT.errors as Record<string, string | ((x: string) => string)>;
  const hit = known[code];
  if (typeof hit === "function") return hit(m?.[2] ?? "");
  if (typeof hit === "string") return hit;
  return sentence(message);
}

/** "Clear actual times" on one run order: actual starts and the pins written while the day ran go; pins set by hand stay (an older plan keeps all of them). */
export async function clearPlanActuals(planId: string): Promise<{ ok: true; actualStarts: number; pins: number; kept: number } | Failed> {
  if (!uuid.safeParse(planId).success) return { ok: false, error: T.errors.failed };
  const { supabase } = await getDb();
  const { data: plan } = await supabase.from("schedule_plans").select("event_id").eq("id", planId).maybeSingle();
  const { data, error } = await supabase.rpc("clear_plan_actuals", { p_plan: planId });
  if (error) return { ok: false, error: partSentence(error.message) };
  if (plan) revalidatePath(`/org/events/${plan.event_id}`, "layout");
  const out = data as unknown as { actual_starts: number; pins: number; kept: number };
  return { ok: true, actualStarts: out.actual_starts, pins: out.pins, kept: out.kept };
}
