"use server";

import { revalidatePath } from "next/cache";
import { getOrgContext } from "@/lib/org/context";
import { canonicalHash } from "@/lib/presets/plan";
import { brandingPathFromUrl } from "@/lib/branding/image";
import { EventFormSchema, parseEventBranding, slugify } from "@/lib/schemas/event-settings";
import { parseIdentificationScheme } from "@/lib/schemas/identification";
import { issuesToMap } from "@/lib/form/path";

export type SaveEventResult =
  | { ok: true; id: string; slug: string }
  | { ok: false; error: string; fields?: Record<string, string> };

/** `id = null` creates the event in the organiser's current organisation; otherwise updates it (Row Level Security decides who may). */
export async function saveEvent(id: string | null, raw: unknown, status: "draft" | "published" | null): Promise<SaveEventResult> {
  const parsed = EventFormSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Some settings need fixing.", fields: issuesToMap(parsed.error.issues) };
  const form = parsed.data;
  const { supabase, current } = await getOrgContext();

  if (id === null) {
    if (!current) return { ok: false, error: "You are not a member of an organisation." };
    const { data, error } = await supabase
      .from("events")
      .insert({
        organisation_id: current.id,
        name: form.name,
        slug: form.slug,
        location: form.location || null,
        timezone: form.timezone,
        start_date: form.start_date,
        end_date: form.end_date,
        status: status ?? "draft",
        settings: form.settings as never,
        branding: form.branding as never,
      })
      .select("id, slug")
      .single();
    if (error) return failure(error);
    revalidatePath("/org", "layout");
    return { ok: true, id: data.id, slug: data.slug };
  }

  const { data: before } = await supabase.from("events").select("organisation_id, status, settings, branding").eq("id", id).maybeSingle();
  if (!before) return { ok: false, error: "That event was not found, or you do not have access to it." };
  const patch: Record<string, unknown> = {
    name: form.name,
    slug: form.slug,
    location: form.location || null,
    timezone: form.timezone,
    start_date: form.start_date,
    end_date: form.end_date,
    // keep settings written by later phases; the form only owns the keys it knows
    settings: { ...((before.settings ?? {}) as object), ...form.settings },
    branding: { ...((before.branding ?? {}) as object), ...form.branding },
  };
  // only draft <-> published is set here; live and complete belong to the heat controls in later phases
  if (status && (before.status === "draft" || before.status === "published")) patch.status = status;
  const { data, error } = await supabase.from("events").update(patch as never).eq("id", id).select("id, slug");
  if (error) return failure(error);
  if (!data || data.length === 0) return { ok: false, error: "The event could not be saved (no permission). Nothing was changed." };

  // Remove logo files that are no longer used (best effort).
  const oldBranding = parseEventBranding(before.branding);
  const kept = new Set([form.branding.logoUrl, ...form.branding.sponsors.map((s) => s.logoUrl)]);
  const gone = [oldBranding.logoUrl, ...oldBranding.sponsors.map((s) => s.logoUrl)].filter((u): u is string => Boolean(u) && !kept.has(u));
  const paths = gone.map((u) => brandingPathFromUrl(u, before.organisation_id)).filter((p): p is string => Boolean(p));
  if (paths.length) await supabase.storage.from("branding").remove(paths);

  revalidatePath("/org", "layout");
  return { ok: true, id: data[0].id, slug: data[0].slug };
}

function failure(error: { code?: string; message: string }): SaveEventResult {
  if (error.code === "23505") return { ok: false, error: "That web address is already used by another event.", fields: { slug: "Already taken: choose another" } };
  if (error.code === "23514") return { ok: false, error: "One of the values is not allowed. Check the highlighted fields.", fields: {} };
  return { ok: false, error: "The event could not be saved. Nothing was changed; try again." };
}

/** Saves an identification scheme as an organisation preset (a new version when the name already exists). */
export async function saveIdentificationPreset(input: { organisationId: string; name: string; scheme: unknown }): Promise<{ ok: true; key: string; name: string; version: number } | { ok: false; error: string }> {
  const name = input.name.trim();
  if (name.length < 2) return { ok: false, error: "Give the preset a name (at least 2 characters)." };
  let scheme;
  try {
    scheme = parseIdentificationScheme(input.scheme);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const { supabase } = await getOrgContext();
  const key = slugify(name) || "scheme";
  const { data: existing } = await supabase.from("presets").select("version").eq("organisation_id", input.organisationId).eq("kind", "identification").eq("key", key);
  const version = Math.max(0, ...(existing ?? []).map((r) => r.version)) + 1;
  const json = { ...scheme, id: key, name };
  const { error } = await supabase.from("presets").insert({
    organisation_id: input.organisationId,
    kind: "identification",
    key,
    name,
    version,
    json: json as never,
    content_hash: canonicalHash(json),
  });
  if (error) return { ok: false, error: "The preset could not be saved. Try again." };
  return { ok: true, key, name, version };
}
