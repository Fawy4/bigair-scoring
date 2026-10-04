import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseOrgSettings, type OrgSettings } from "@/lib/schemas/org-settings";
import { readPlatformSession } from "@/lib/platform/session";
import { signedInUser } from "@/lib/supabase/claims";

export const ORG_COOKIE = "bigair_org";

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "staff";
  settings: OrgSettings;
  logoUrl: string | null;
  /** True when a platform admin is inside this organisation through "Open as this organiser". */
  viaImpersonation?: boolean;
}

/**
 * The signed-in organiser's database connection and who they are, from the login token (no request to the auth server: see `signedInUser`). This is all a page or an action
 * needs to read and write as the organiser; the database decides what the organiser may see. Read once per request.
 */
export const getDb = cache(async () => {
  const supabase = await createClient();
  const user = await signedInUser(supabase);
  if (!user || user.isAnonymous) redirect("/org/login");
  return { supabase, user };
});

/**
 * Signed-in organiser, all their organisations, and the one they are working in (cookie, else the first). Also who they are on
 * the platform: an admin sees the header switch, and while "Open as this organiser" is active that organisation is the current one.
 * Read once per request (layout and page share it). The organisations and the platform role are asked for at the same time.
 */
export const getOrgContext = cache(async () => {
  const { supabase, user } = await getDb();

  // Only the caller's own memberships (an organisation admin may also read the other members' rows).
  const [{ data }, platform] = await Promise.all([
    supabase.from("memberships").select("role, organisations(id, name, slug, settings, branding)").eq("user_id", user.id).order("created_at", { ascending: true }),
    readPlatformSession(supabase),
  ]);
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

  const inside = platform.impersonating;
  if (inside && !orgs.some((o) => o.id === inside.organisationId)) {
    const { data: o } = await supabase.from("organisations").select("id, name, slug, settings, branding").eq("id", inside.organisationId).maybeSingle();
    if (o) {
      orgs.push({
        id: o.id,
        name: o.name,
        slug: o.slug,
        role: "owner",
        settings: parseOrgSettings(o.settings),
        logoUrl: ((o.branding ?? {}) as { logoUrl?: string }).logoUrl ?? null,
        viaImpersonation: true,
      });
    }
  }

  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const current = orgs.find((o) => o.id === wanted) ?? orgs.find((o) => o.id === inside?.organisationId) ?? orgs[0] ?? null;
  return { supabase, user, orgs, current, platformRole: platform.role, impersonating: inside };
});
