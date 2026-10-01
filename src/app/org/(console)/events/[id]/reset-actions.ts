"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrgContext } from "@/lib/org/context";
import { copyProblems, resetTarget } from "@/lib/reset/plan";
import { copy } from "@/lib/ui-copy";
import type { DivisionDraw } from "@/lib/engine/ladder";

const T = copy.reset;
const uuid = z.string().uuid();

export interface ResetPreview {
  slug: string;
  counts: { heats: number; all_heats: number; reruns: number; attempts: number; scores: number; published_results: number };
  running: string | null;
  everPublic: boolean;
  /** Divisions that cannot be reset, each with the one sentence that helps. */
  problems: string[];
}

type Failed = { ok: false; error: string };

/** "HEAT_RUNNING: Heat 3" → the sentence for it. Anything unknown becomes the plain "could not be done". */
function sentence(message: string): string {
  const m = /^([A-Z_]+)(?:: (.*))?$/.exec(message.trim());
  const code = m?.[1] ?? "";
  const detail = m?.[2] ?? "";
  if (code === "HEAT_RUNNING") return T.errors.HEAT_RUNNING(detail);
  if (code === "DRAW_COPY_MISSING") return detail ? `${T.errors.DRAW_COPY_MISSING} (${detail})` : T.errors.DRAW_COPY_MISSING;
  const plain: Record<string, string> = { NOT_ALLOWED: T.errors.NOT_ALLOWED, SLUG_MISMATCH: T.errors.SLUG_MISMATCH, REASON_REQUIRED: T.errors.REASON_REQUIRED, BAD_PROJECTION: T.errors.BAD_PROJECTION };
  return plain[code] ?? T.errors.failed;
}

/** What a reset would do, from the database: the counts, a heat that is running, which divisions cannot be reset, and whether a reason is needed. */
export async function previewReset(eventId: string): Promise<{ ok: true; preview: ResetPreview } | Failed> {
  if (!uuid.safeParse(eventId).success) return { ok: false, error: T.errors.failed };
  const { supabase } = await getOrgContext();
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
      problems: copyProblems(d.divisions.map((x) => ({ name: x.name, drawn: x.drawn, hasCopy: x.has_copy, heatLeftScheduled: x.heat_left_scheduled }))),
    },
  };
}

const ResetInput = z.object({ eventId: uuid, slug: z.string().max(80), reason: z.string().max(500).optional() });

/** Resets the event: the pure plan makes the target ladder of each division, the database function checks it and writes everything in one transaction. */
export async function resetEvent(input: z.input<typeof ResetInput>): Promise<{ ok: true; counts: ResetPreview["counts"] } | Failed> {
  const parsed = ResetInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: T.errors.failed };
  const { eventId, slug, reason } = parsed.data;
  const { supabase } = await getOrgContext();
  const { data: divisions, error: divError } = await supabase.from("divisions").select("id, draw, draw_at_lock, draw_locked_at").eq("event_id", eventId).not("draw", "is", null);
  if (divError) return { ok: false, error: T.errors.failed };
  const draws: Array<{ division: string; draw: DivisionDraw; projection: unknown }> = [];
  try {
    for (const d of divisions ?? []) {
      // the starting draw: the copy taken at lock time, or (for a draw that is not locked and untouched) the draw itself; the database refuses anything else
      const source = (d.draw_at_lock ?? (d.draw_locked_at ? null : d.draw)) as unknown as DivisionDraw | null;
      if (!source) continue; // the database names the division without a copy
      const t = resetTarget(source);
      draws.push({ division: d.id, draw: t.draw, projection: t.projection });
    }
  } catch {
    return { ok: false, error: T.errors.failed };
  }
  const { data, error } = await supabase.rpc("reset_event", { p_event: eventId, p_slug: slug, p_reason: reason ?? "", p_draws: draws as never });
  if (error) return { ok: false, error: sentence(error.message) };
  revalidatePath(`/org/events/${eventId}`, "layout");
  return { ok: true, counts: data as unknown as ResetPreview["counts"] };
}

/** Platform owners only: brings back what a reset wiped. */
export async function restoreReset(snapshotId: string): Promise<{ ok: true } | Failed> {
  if (!uuid.safeParse(snapshotId).success) return { ok: false, error: T.restore.errors.failed };
  const { supabase } = await getOrgContext();
  const { error } = await supabase.rpc("restore_event_reset", { p_snapshot: snapshotId });
  if (error) {
    const code = /^([A-Z_]+)/.exec(error.message.trim())?.[1] ?? "";
    const errs = T.restore.errors as Record<string, string>;
    return { ok: false, error: errs[code] ?? T.restore.errors.failed };
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}
