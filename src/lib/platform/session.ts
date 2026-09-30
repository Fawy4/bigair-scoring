import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type PlatformRole = "owner" | "staff";
export interface Impersonation {
  organisationId: string;
  name: string;
  slug: string;
  expiresAt: string;
}
export interface PlatformSession {
  role: PlatformRole | null;
  impersonating: Impersonation | null;
}

/** Reads the caller's platform role and open impersonation session from the database (RLS decides; nothing is trusted from the browser). */
export async function readPlatformSession(supabase: SupabaseClient<Database>): Promise<PlatformSession> {
  const { data, error } = await supabase.rpc("platform_session");
  const raw = (error ? null : data) as { role?: string | null; impersonating?: { organisation_id: string; name: string; slug: string; expires_at: string } | null } | null;
  const role = raw?.role === "owner" || raw?.role === "staff" ? raw.role : null;
  const i = role ? raw?.impersonating : null;
  return {
    role,
    impersonating: i ? { organisationId: i.organisation_id, name: i.name, slug: i.slug, expiresAt: i.expires_at } : null,
  };
}

/**
 * The gate for every /admin page and action. Signed-out visitors go to the sign-in page; anybody who is not a platform admin
 * (organisers, officials) gets the ordinary 404, so the pages are not even confirmed to exist.
 */
export const requireAdmin = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) redirect("/org/login?next=%2Fadmin");
  const session = await readPlatformSession(supabase);
  if (!session.role) notFound();
  return { supabase, user, role: session.role, impersonating: session.impersonating };
});
