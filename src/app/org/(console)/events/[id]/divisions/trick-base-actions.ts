"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/org/context";
import { loadEventVocabulary, loadMasterVocabulary } from "@/lib/org/trick-vocabulary";
import type { VocabularyJson } from "@/lib/trick-base";
import { diffVocabularies, type VocabularyDiff } from "@/lib/trick-base/master";
import { copy } from "@/lib/ui-copy";

const T = copy.trickEditor.event;

export interface EventTrickBase {
  vocabulary: VocabularyJson;
  version: number;
  latest: number;
  /** From this event's version to the newest published one, in words; null when the event is on the newest. */
  diff: VocabularyDiff | null;
  /** Each division's stored trick base as it is in the database now, so the panel never starts from a page that was drawn before an update or another tab's save. */
  divisionTrickBases: Record<string, unknown>;
}

/** The master version this event uses, and what "Update to latest" would change (the same words the owner saw when publishing). */
export async function loadEventTrickBase(eventId: string): Promise<{ ok: true; base: EventTrickBase } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(eventId).success) return { ok: false, error: T.errors.generic };
  const { supabase } = await getDb();
  const mine = await loadEventVocabulary(supabase, eventId);
  if (!mine) return { ok: false, error: T.errors.NOT_FOUND };
  let diff: VocabularyDiff | null = null;
  if (mine.latest > mine.version) {
    const latest = await loadMasterVocabulary(supabase);
    if (latest) diff = diffVocabularies(mine.vocabulary, latest.vocabulary);
  }
  const { data: divisions } = await supabase.from("divisions").select("id, trick_base").eq("event_id", eventId);
  const divisionTrickBases = Object.fromEntries((divisions ?? []).map((d) => [d.id, d.trick_base]));
  return { ok: true, base: { vocabulary: mine.vocabulary, version: mine.version, latest: mine.latest, diff, divisionTrickBases } };
}

/** "Update to latest": the whole event moves to the newest published version (refused while a heat is running or paused). */
export async function updateEventTrickBase(eventId: string): Promise<{ ok: true; version: number } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(eventId).success) return { ok: false, error: T.errors.generic };
  const { supabase } = await getDb();
  const { data, error } = await supabase.rpc("update_event_trick_base", { p_event: eventId });
  if (error) {
    const code = Object.keys(T.errors).find((k) => error.message.includes(k));
    return { ok: false, error: T.errors[code ?? "generic"] };
  }
  revalidatePath(`/org/events/${eventId}`, "layout");
  return { ok: true, version: (data as { to: number }).to };
}
