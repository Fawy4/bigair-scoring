"use server";

import { z } from "zod";
import { FEEDBACK_TAGS } from "@/lib/feedback/format";
import { requireAdmin } from "@/lib/platform/session";
import { copy } from "@/lib/ui-copy";

/** The owner marks a note done (or open again) or changes its kind. The text of a note is never changed. */
export async function updateNote(id: string, patch: { status?: "open" | "done"; tag?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, role } = await requireAdmin();
  if (role !== "owner") return { ok: false, error: copy.feedback.errors.notAllowed };
  const parsed = z.object({ id: z.string().uuid(), status: z.enum(["open", "done"]).optional(), tag: z.enum(FEEDBACK_TAGS).optional() }).safeParse({ id, ...patch });
  if (!parsed.success) return { ok: false, error: copy.feedback.errors.notAllowed };
  const { id: noteId, ...fields } = parsed.data;
  if (Object.keys(fields).length === 0) return { ok: true };
  const { data, error } = await supabase.from("feedback_notes").update(fields).eq("id", noteId).select("id");
  return error || !data?.length ? { ok: false, error: copy.feedback.failed } : { ok: true };
}

/** The owner sets several notes done, or open again, at once. Returns how many notes really changed (a note already in that state is not counted). */
export async function updateNotes(ids: string[], status: "open" | "done"): Promise<{ ok: true; changed: number } | { ok: false; error: string }> {
  const { supabase, role } = await requireAdmin();
  if (role !== "owner") return { ok: false, error: copy.feedback.errors.notAllowed };
  const parsed = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), status: z.enum(["open", "done"]) }).safeParse({ ids, status });
  if (!parsed.success) return { ok: false, error: copy.feedback.errors.notAllowed };
  const { data, error } = await supabase.from("feedback_notes").update({ status: parsed.data.status }).in("id", parsed.data.ids).neq("status", parsed.data.status).select("id");
  return error ? { ok: false, error: copy.feedback.failed } : { ok: true, changed: data?.length ?? 0 };
}
