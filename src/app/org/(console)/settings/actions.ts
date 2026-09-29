"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOrgContext } from "@/lib/org/context";
import { brandingPathFromUrl } from "@/lib/branding/image";
import { OrgNameSchema, OrgSlugSchema, TimeZoneSchema } from "@/lib/schemas/org-settings";

const Input = z.object({
  name: OrgNameSchema,
  slug: OrgSlugSchema,
  defaultTimezone: TimeZoneSchema,
  logoUrl: z.string().url().nullable(),
});

export type SettingsResult = { ok: true; slug: string } | { ok: false; error: string; fields?: Record<string, string> };

export async function saveOrganisationSettings(raw: unknown): Promise<SettingsResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0] ?? "form")] ??= i.message;
    return { ok: false, error: "Some settings need fixing.", fields };
  }
  const { supabase, current } = await getOrgContext();
  if (!current) return { ok: false, error: "You are not a member of an organisation." };
  if (current.role !== "owner" && current.role !== "admin") return { ok: false, error: "Only owners and admins can change organisation settings." };

  const { name, slug, defaultTimezone, logoUrl } = parsed.data;
  const { data: before } = await supabase.from("organisations").select("branding").eq("id", current.id).single();
  const branding = { ...((before?.branding ?? {}) as Record<string, unknown>) };
  if (logoUrl) branding.logoUrl = logoUrl;
  else delete branding.logoUrl;

  const { data, error } = await supabase
    .from("organisations")
    .update({ name, slug, settings: { defaultTimezone }, branding: branding as never })
    .eq("id", current.id)
    .select("id");
  if (error) {
    if (error.code === "23505") return { ok: false, error: "That web address is already used by another organisation.", fields: { slug: "Already taken: choose another" } };
    return { ok: false, error: "The settings could not be saved. Nothing was changed; try again." };
  }
  if (!data || data.length === 0) return { ok: false, error: "The settings could not be saved (no permission). Nothing was changed." };

  // Tidy up the replaced logo file (best effort: a leftover file is harmless).
  const oldPath = brandingPathFromUrl((before?.branding as { logoUrl?: string } | null)?.logoUrl, current.id);
  if (oldPath && logoUrl !== (before?.branding as { logoUrl?: string }).logoUrl) await supabase.storage.from("branding").remove([oldPath]);

  revalidatePath("/org", "layout");
  return { ok: true, slug };
}
