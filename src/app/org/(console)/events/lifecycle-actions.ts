"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { copy } from "@/lib/ui-copy";

export type LifecycleResult = { ok: true } | { ok: false; error: string };

function fail(message: string | undefined): LifecycleResult {
  const table = copy.eventLifecycle.errors;
  const code = Object.keys(table).find((c) => c !== "generic" && message?.includes(c));
  return { ok: false, error: table[code ?? "generic"] };
}

/**
 * Deletes an event and everything that hangs off it, in one database transaction. The database decides who may (organisers of the event's
 * organisation and platform owners), checks the typed web address, and refuses once any result is published. Used by the organiser's Event
 * step and by the owner's events table in /admin.
 */
export async function deleteEvent(eventId: string, typedSlug: string): Promise<LifecycleResult> {
  if (!z.string().uuid().safeParse(eventId).success) return fail(undefined);
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_event", { p_event: eventId, p_slug_confirm: typedSlug });
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Hides an event everywhere (public site, officials' join page, event lists) or brings it back. Nothing is deleted. */
export async function setEventArchived(eventId: string, archived: boolean): Promise<LifecycleResult> {
  if (!z.string().uuid().safeParse(eventId).success) return fail(undefined);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_event_archived", { p_event: eventId, p_archived: archived });
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true };
}
