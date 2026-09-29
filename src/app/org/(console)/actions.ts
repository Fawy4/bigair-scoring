"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ORG_COOKIE } from "@/lib/org/context";

/** Remembers which organisation the organiser is working in. Only organisations they belong to are accepted. */
export async function switchOrganisation(orgId: string): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.from("memberships").select("organisation_id").eq("organisation_id", orgId).maybeSingle();
  if (!data) return;
  (await cookies()).set(ORG_COOKIE, orgId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/org", "layout");
}
