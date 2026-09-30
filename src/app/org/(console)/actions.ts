"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getOrgContext, ORG_COOKIE } from "@/lib/org/context";

/** Remembers which organisation the organiser is working in. Only organisations they belong to (or are viewing as) are accepted. */
export async function switchOrganisation(orgId: string): Promise<void> {
  const { orgs } = await getOrgContext();
  if (!orgs.some((o) => o.id === orgId)) return;
  (await cookies()).set(ORG_COOKIE, orgId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/org", "layout");
}
