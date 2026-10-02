import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { LocalBlock, VocabularyJson } from "@/lib/trick-base";

export const MASTER_VOCABULARY_KEY = "big-air-vocabulary";
export const EVENT_VOCABULARY_KEY = "event-additions";

/** The master trick base every customer sees: the highest published version of the system row. */
export async function loadMasterVocabulary(supabase: SupabaseClient<Database>): Promise<{ vocabulary: VocabularyJson; version: number } | null> {
  const { data } = await supabase
    .from("trick_vocabularies")
    .select("json, version")
    .is("organisation_id", null)
    .is("event_id", null)
    .eq("key", MASTER_VOCABULARY_KEY)
    .not("published_at", "is", null)
    .order("version", { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (!row) return null;
  const v = row.json as unknown as VocabularyJson;
  return Array.isArray(v?.baseTricks) && Array.isArray(v?.modifiers) ? { vocabulary: v, version: row.version } : null;
}

/** The blocks this event added itself (stored as the event's own vocabulary row). */
export async function loadEventBlocks(supabase: SupabaseClient<Database>, eventId: string): Promise<LocalBlock[]> {
  const { data } = await supabase.from("trick_vocabularies").select("json").eq("event_id", eventId).eq("key", EVENT_VOCABULARY_KEY).limit(1);
  const blocks = (data?.[0]?.json as { blocks?: unknown } | undefined)?.blocks;
  return Array.isArray(blocks) ? (blocks as LocalBlock[]).filter((b) => b && typeof b.key === "string" && typeof b.label === "string" && typeof b.family === "string") : [];
}

/** One master version, published or not (drafts are readable by platform admins only, through row security). */
export async function loadVocabularyVersion(supabase: SupabaseClient<Database>, version: number): Promise<VocabularyJson | null> {
  const { data } = await supabase.from("trick_vocabularies").select("json").is("organisation_id", null).is("event_id", null).eq("key", MASTER_VOCABULARY_KEY).eq("version", version).limit(1);
  const v = data?.[0]?.json as unknown as VocabularyJson | undefined;
  return v && Array.isArray(v.baseTricks) && Array.isArray(v.modifiers) ? v : null;
}

/**
 * The master version this event uses (it keeps it until an organiser presses "Update to latest"), and the newest published version.
 * An event without a version (made before versions were kept) uses the newest one.
 */
export async function loadEventVocabulary(supabase: SupabaseClient<Database>, eventId: string): Promise<{ vocabulary: VocabularyJson; version: number; latest: number } | null> {
  const [{ data: ev }, latest] = await Promise.all([supabase.from("events").select("trick_vocabulary_version").eq("id", eventId).maybeSingle(), loadMasterVocabulary(supabase)]);
  if (!latest) return null;
  const pinned = ev?.trick_vocabulary_version ?? null;
  if (pinned === null || pinned === latest.version) return { vocabulary: latest.vocabulary, version: latest.version, latest: latest.version };
  const own = await loadVocabularyVersion(supabase, pinned);
  return own ? { vocabulary: own, version: pinned, latest: latest.version } : { vocabulary: latest.vocabulary, version: latest.version, latest: latest.version };
}
