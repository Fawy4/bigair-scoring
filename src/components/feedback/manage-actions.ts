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
