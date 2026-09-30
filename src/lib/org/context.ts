import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseOrgSettings, type OrgSettings } from "@/lib/schemas/org-settings";

export const ORG_COOKIE = "bigair_org";

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "staff";
  settings: OrgSettings;
  logoUrl: string | null;
}

/** Signed-in organiser, all their organisations, and the one they are working in (cookie, else the first). */
export async function getOrgContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) redirect("/org/login");

  const { data } = await supabase
    .from("memberships")
    .select("role, organisations(id, name, slug, settings, branding)")
    .order("created_at", { ascending: true });
  const orgs: OrgSummary[] = (data ?? []).flatMap((m) =>
    m.organisations
      ? [
          {
            id: m.organisations.id,
            name: m.organisations.name,
            slug: m.organisations.slug,
            role: m.role as OrgSummary["role"],
            settings: parseOrgSettings(m.organisations.settings),
            logoUrl: ((m.organisations.branding ?? {}) as { logoUrl?: string }).logoUrl ?? null,
          },
        ]
      : [],
  );
  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const current = orgs.find((o) => o.id === wanted) ?? orgs[0] ?? null;
  return { supabase, user, orgs, current };
}
