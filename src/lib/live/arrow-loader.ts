import type { SupabaseClient } from "@supabase/supabase-js";
import type { IdentificationScheme } from "@/lib/schemas/identification";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/database.types";
import { ARROW_ORG_SLUG, schemeFromSettings } from "./arrow-scheme";

export interface ArrowScheme {
  eventName: string;
  scheme: IdentificationScheme;
}

type Db = SupabaseClient<Database>;

/** The newest event of the Arrow organisation that has a saved scheme. `publicOnly` limits it to what a visitor may see (published, live or complete). */
async function newestWithScheme(db: Db, publicOnly: boolean): Promise<ArrowScheme | null> {
  const { data: org } = await db.from("organisations").select("id").eq("slug", ARROW_ORG_SLUG).is("archived_at", null).maybeSingle();
  if (!org) return null;
  let q = db.from("events").select("name, settings").eq("organisation_id", org.id).is("archived_at", null);
  if (publicOnly) q = q.in("status", ["published", "live", "complete"]);
  const { data } = await q.order("start_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(10);
  for (const e of data ?? []) {
    const scheme = schemeFromSettings(e.settings);
    if (scheme) return { eventName: e.name, scheme };
  }
  return null;
}

/**
 * The real Rider label scheme of the Arrow event, for the Rider label section of /design. Nothing else of the event is read, and nothing secret
 * (named columns only: name and settings).
 * 1. When the visitor is signed in as an organiser of Arrow, their own access (row level security) shows the event even before it is published.
 * 2. Otherwise only an event a visitor could see anyway (published, live, complete) is read, with the server's key.
 * Any failure (no keys, database asleep) gives null and the page falls back to the three standard schemes.
 */
export async function loadArrowScheme(): Promise<ArrowScheme | null> {
  try {
    const own = await newestWithScheme(await createClient(), false);
    if (own) return own;
  } catch {
    /* not signed in, or no access: try the public way */
  }
  try {
    return await newestWithScheme(createServiceClient(), true);
  } catch {
    return null;
  }
}
