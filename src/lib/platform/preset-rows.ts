import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { MasterKind, MasterRow } from "./master-presets";

/** All versions (drafts included) of one system preset, newest first. Admins can read drafts through RLS. */
export async function loadVersions(supabase: SupabaseClient<Database>, kind: MasterKind, key: string): Promise<MasterRow[]> {
  const columns = "id, key, name, version, published_at, created_at";
  if (kind === "trick_vocabulary") {
    const { data } = await supabase.from("trick_vocabularies").select("id, key, version, published_at, created_at").is("organisation_id", null).is("event_id", null).eq("key", key).order("version", { ascending: false });
    return (data ?? []).map((r) => ({ ...r, name: r.key }));
  }
  const table = kind === "scoring_model" ? "scoring_models" : kind === "format_template" ? "format_templates" : "presets";
  const query = supabase.from(table as "scoring_models").select(columns).is("organisation_id", null).eq("key", key);
  const { data } = await (kind === "identification" ? query.eq("kind" as never, "identification") : query).order("version", { ascending: false });
  return (data ?? []) as MasterRow[];
}

export interface PresetSummary {
  key: string;
  name: string;
  versions: MasterRow[];
}

/** Every system preset of one kind, grouped by key, versions newest first (drafts included: admins can read them). */
export async function loadPresetSummaries(supabase: SupabaseClient<Database>, kind: MasterKind): Promise<PresetSummary[]> {
  let rows: Array<MasterRow & { key: string }> = [];
  if (kind === "trick_vocabulary") {
    const { data } = await supabase.from("trick_vocabularies").select("id, key, version, published_at").is("organisation_id", null).is("event_id", null);
    rows = (data ?? []).map((r) => ({ ...r, name: r.key }));
  } else {
    const table = kind === "scoring_model" ? "scoring_models" : kind === "format_template" ? "format_templates" : "presets";
    const query = supabase.from(table as "scoring_models").select("id, key, name, version, published_at").is("organisation_id", null);
    const { data } = await (kind === "identification" ? query.eq("kind" as never, "identification") : query);
    rows = (data ?? []) as MasterRow[];
  }
  const groups = new Map<string, MasterRow[]>();
  for (const r of rows) groups.set(r.key, [...(groups.get(r.key) ?? []), r]);
  return [...groups.entries()]
    .map(([key, versions]) => {
      const sorted = versions.sort((a, b) => b.version - a.version);
      return { key, name: sorted[0].name, versions: sorted };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
