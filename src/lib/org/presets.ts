import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { builtInSchemes, IdentificationSchemeSchema, type IdentificationScheme } from "@/lib/schemas/identification";

/** What the organisation's saved Rider labels are read with, as a column list of the `presets` table. */
export const SCHEME_ROWS = "presets(key, version, json)";
export interface SchemeRow {
  key: string;
  version: number;
  json: unknown;
}

/** Built-in schemes plus the organisation's saved ones (latest version of each key), from the preset rows (any order). */
export function identificationSchemesFrom(rows: readonly SchemeRow[]): IdentificationScheme[] {
  const seen = new Set<string>();
  const own: IdentificationScheme[] = [];
  for (const row of [...rows].sort((a, b) => b.version - a.version)) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    const parsed = IdentificationSchemeSchema.safeParse(row.json);
    if (parsed.success) own.push({ ...parsed.data, id: `org:${row.key}` });
  }
  return [...builtInSchemes(), ...own];
}

/** Built-in schemes plus the organisation's saved ones (latest version of each key). */
export async function loadIdentificationSchemes(supabase: SupabaseClient<Database>, organisationId: string): Promise<IdentificationScheme[]> {
  const { data } = await supabase.from("presets").select("key, version, json").eq("organisation_id", organisationId).eq("kind", "identification").order("version", { ascending: false });
  return identificationSchemesFrom(data ?? []);
}
