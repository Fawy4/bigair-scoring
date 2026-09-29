import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { builtInSchemes, IdentificationSchemeSchema, type IdentificationScheme } from "@/lib/schemas/identification";

/** Built-in schemes plus the organisation's saved ones (latest version of each key). */
export async function loadIdentificationSchemes(supabase: SupabaseClient<Database>, organisationId: string): Promise<IdentificationScheme[]> {
  const { data } = await supabase.from("presets").select("key, version, json").eq("organisation_id", organisationId).eq("kind", "identification").order("version", { ascending: false });
  const seen = new Set<string>();
  const own: IdentificationScheme[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    const parsed = IdentificationSchemeSchema.safeParse(row.json);
    if (parsed.success) own.push({ ...parsed.data, id: `org:${row.key}` });
  }
  return [...builtInSchemes(), ...own];
}
