"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ORG_COOKIE } from "@/lib/org/context";
import { requireAdmin } from "@/lib/platform/session";
import { loadVersions } from "@/lib/platform/preset-rows";
import { SETTINGS_TAG } from "@/lib/platform/public-settings";
import { validatePlatformSettings, settingsToRows, type SettingsInput } from "@/lib/platform/settings";
import { inviteConfirmLink } from "@/lib/platform/organisation";
import { classifyEmailError, emailLimitPerHour, type EmailFailure } from "@/lib/auth/email-send";
import { requestOrigin } from "@/lib/platform/origin";
import { MASTER_KINDS, nextVersion, prepareNewVersion, validateMasterPreset, type MasterKind } from "@/lib/platform/master-presets";
import { canonicalHash } from "@/lib/presets/plan";
import { drawDemoEvent } from "@/lib/demo/draw";
import { OrgNameSchema, OrgSlugSchema, TimeZoneSchema } from "@/lib/schemas/org-settings";
import { findUserByEmail } from "@/lib/supabase/admin-users";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/database.types";
import { copy } from "@/lib/ui-copy";

export type Failure = { ok: false; error: string; fields?: Record<string, string> };

/** Turns a database error code (the text after "ERROR:") into a plain-language sentence. */
function errorText(message: string | undefined, table: Record<string, string> = copy.admin.errors): string {
  const code = Object.keys(table).find((c) => c !== "generic" && message?.includes(c));
  return table[code ?? "generic"];
}
const fail = (message?: string, table?: Record<string, string>): Failure => ({ ok: false, error: errorText(message, table) });
const fieldErrors = (error: z.ZodError): Record<string, string> => {
  const fields: Record<string, string> = {};
  for (const i of error.issues) fields[String(i.path[0] ?? "form")] ??= i.message;
  return fields;
};

// ------------------------------------------------------------------ impersonation ("Open as this organiser")

/** Starts a session inside an organisation (audited by the database) and opens its organiser screens. */
export async function startImpersonation(formData: FormData): Promise<void> {
  const orgId = z.string().uuid().safeParse(formData.get("orgId"));
  if (!orgId.success) redirect("/admin");
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("admin_start_impersonation", { p_org: orgId.data });
  if (error) redirect(`/admin?problem=${encodeURIComponent(errorText(error.message))}`);
  (await cookies()).set(ORG_COOKIE, orgId.data, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 });
  revalidatePath("/org", "layout");
  redirect("/org");
}

/** "back to admin": closes the session (audited) and returns to the admin screens. */
export async function stopImpersonation(): Promise<void> {
  const { supabase } = await requireAdmin();
  await supabase.rpc("admin_stop_impersonation");
  (await cookies()).delete(ORG_COOKIE);
  revalidatePath("/org", "layout");
  redirect("/admin");
}

// ------------------------------------------------------------------ organisations

const CreateInput = z.object({ name: OrgNameSchema, slug: OrgSlugSchema, timezone: TimeZoneSchema });

export async function createOrganisation(raw: unknown): Promise<{ ok: true; id: string } | Failure> {
  const parsed = CreateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: copy.orgSettings.fixThese, fields: fieldErrors(parsed.error) };
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_create_organisation", { p_name: parsed.data.name, p_slug: parsed.data.slug, p_timezone: parsed.data.timezone });
  if (error) {
    const f = fail(error.message);
    return error.message.includes("SLUG_TAKEN") ? { ...f, fields: { slug: f.error } } : f;
  }
  revalidatePath("/admin");
  return { ok: true, id: data as string };
}

export async function renameOrganisation(orgId: string, name: string): Promise<{ ok: true } | Failure> {
  const parsed = OrgNameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, fields: { name: parsed.error.issues[0].message } };
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("admin_rename_organisation", { p_org: orgId, p_name: parsed.data });
  if (error) return fail(error.message);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function setOrganisationLogo(orgId: string, url: string | null): Promise<{ ok: true } | Failure> {
  if (url !== null && !z.string().url().safeParse(url).success) return fail("INVALID_URL");
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("admin_set_organisation_logo", { p_org: orgId, p_logo_url: url as string });
  if (error) return fail(error.message);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function setOrganisationArchived(orgId: string, archived: boolean): Promise<{ ok: true } | Failure> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("admin_set_organisation_archived", { p_org: orgId, p_archived: archived });
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Owner only, refused by the database while results are published. Afterwards the organisation's logo files are removed (best effort). */
export async function deleteOrganisation(orgId: string, typedSlug: string): Promise<{ ok: true } | Failure> {
  const { supabase, role } = await requireAdmin();
  if (role !== "owner") return fail("NOT_ALLOWED");
  const { error } = await supabase.rpc("admin_delete_organisation", { p_org: orgId, p_slug_confirm: typedSlug });
  if (error) return fail(error.message);
  try {
    const service = createServiceClient();
    const { data: files } = await service.storage.from("branding").list(orgId);
    if (files?.length) await service.storage.from("branding").remove(files.map((f) => `${orgId}/${f.name}`));
  } catch {
    // a leftover logo file is harmless
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export type InviteResult =
  | { ok: true; email: string; emailSent: boolean; emailFailed: boolean; failure: EmailFailure | null; limitPerHour: number; link: string | null }
  | Failure;

/**
 * Creates the invite-only login (already confirmed, so it can sign in with a link), makes it owner of the organisation, and either sends
 * the sign-in email or, when email is off or unavailable, hands back a link to copy. The database writes the audit line.
 */
export async function inviteOrganiser(input: { orgId: string; email: string; sendEmail: boolean }): Promise<InviteResult> {
  const parsed = z.object({ orgId: z.string().uuid(), email: z.string().trim().toLowerCase().email(), sendEmail: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: copy.admin.org.inviteBadEmail, fields: { email: copy.admin.org.inviteBadEmail } };
  const { orgId, email, sendEmail } = parsed.data;
  const { supabase } = await requireAdmin();
  const check = await supabase.rpc("admin_organisation_members", { p_org: orgId });
  if (check.error) return fail(check.error.message);

  const service = createServiceClient();
  let user = await findUserByEmail(service, email);
  if (!user) {
    const created = await service.auth.admin.createUser({ email, email_confirm: true });
    if (created.error || !created.data.user) return fail();
    user = created.data.user;
  }
  const added = await supabase.rpc("admin_add_organiser", { p_org: orgId, p_user: user.id, p_role: "owner" });
  if (added.error) return fail(added.error.message);

  const origin = await requestOrigin();
  let emailSent = false;
  let failure: EmailFailure | null = null;
  if (sendEmail) {
    // sent from here (not from the invitee's browser), so the link in the e-mail comes back with the session after "#": /auth/link reads it, in any browser
    const anon = createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const sent = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/link?next=%2Forg` } });
    failure = classifyEmailError(sent.error);
    emailSent = !sent.error;
  }
  let link: string | null = null;
  if (!emailSent) {
    // generated after the email attempt, because a new link replaces an older one for the same login
    const generated = await service.auth.admin.generateLink({ type: "magiclink", email });
    if (generated.error || !generated.data) return fail();
    link = inviteConfirmLink(origin, generated.data.properties.hashed_token);
  }
  revalidatePath(`/admin/organisations/${orgId}`);
  return { ok: true, email, emailSent, emailFailed: sendEmail && !emailSent, failure, limitPerHour: emailLimitPerHour(), link };
}

/**
 * Owner only. Takes a person out of one organisation: their access ends at once and every session they hold is deleted (the database does both and writes the audit
 * line). The login stays, so the same address can be invited again later.
 */
export async function removeOrganiser(input: { orgId: string; userId: string }): Promise<{ ok: true } | Failure> {
  const parsed = z.object({ orgId: z.string().uuid(), userId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail();
  const { supabase, role } = await requireAdmin();
  if (role !== "owner") return fail("NOT_ALLOWED");
  const { error } = await supabase.rpc("admin_remove_organiser", { p_org: parsed.data.orgId, p_user: parsed.data.userId });
  if (error) return fail(error.message);
  revalidatePath(`/admin/organisations/${parsed.data.orgId}`);
  revalidatePath("/admin");
  return { ok: true };
}

// ------------------------------------------------------------------ platform settings

export async function savePlatformSettings(input: SettingsInput): Promise<{ ok: true } | Failure> {
  const checked = validatePlatformSettings(input);
  if (!checked.ok) return { ok: false, error: copy.admin.settings.fixThese, fields: checked.fields };
  const { supabase, role } = await requireAdmin();
  if (role !== "owner") return fail("NOT_ALLOWED");
  const values = Object.fromEntries(settingsToRows(checked.value).map((r) => [r.key, r.value]));
  const { error } = await supabase.rpc("admin_save_platform_settings", { p_values: values as Json });
  if (error) return { ok: false, error: errorText(error.message, { NOT_ALLOWED: copy.admin.errors.NOT_ALLOWED, generic: copy.admin.settings.saveFailed }) };
  revalidateTag(SETTINGS_TAG);
  revalidatePath("/", "layout");
  return { ok: true };
}

// ------------------------------------------------------------------ master presets

const KIND = z.enum(MASTER_KINDS.map((k) => k.kind) as [MasterKind, ...MasterKind[]]);
const presetErrors = copy.admin.presets.errors;

/** Saves what the owner typed as the next version of a system preset. It is a draft: customers see nothing until it is published. */
export async function saveNewPresetVersion(input: { kind: string; key: string; jsonText: string }): Promise<{ ok: true; version: number } | Failure> {
  const kind = KIND.safeParse(input.kind);
  if (!kind.success) return { ok: false, error: presetErrors.generic };
  let json: unknown;
  try {
    json = JSON.parse(input.jsonText);
  } catch {
    return { ok: false, error: copy.admin.presets.notJson };
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) return { ok: false, error: presetErrors.NOT_OBJECT };
  const { supabase } = await requireAdmin();

  // the version number comes from the database's own rows, not from the browser
  const rows = await loadVersions(supabase, kind.data, input.key);
  const version = nextVersion(rows);
  const prepared = prepareNewVersion(kind.data, json as Record<string, unknown>, { key: input.key, version });
  const valid = validateMasterPreset(kind.data, prepared);
  if (!valid.ok) return { ok: false, error: copy.admin.presets.invalid(valid.message) };

  const name = typeof prepared.name === "string" && prepared.name.trim() ? prepared.name : (rows[0]?.name ?? input.key);
  const { error } = await supabase.rpc("admin_create_preset_version", {
    p_kind: kind.data,
    p_key: input.key,
    p_name: name,
    p_json: prepared as Json,
    p_hash: canonicalHash(prepared),
  });
  if (error) return { ok: false, error: errorText(error.message, presetErrors) };
  revalidatePath("/admin/presets", "layout");
  return { ok: true, version };
}

export async function publishPreset(kind: string, id: string): Promise<{ ok: true } | Failure> {
  const parsed = KIND.safeParse(kind);
  if (!parsed.success || !z.string().uuid().safeParse(id).success) return { ok: false, error: presetErrors.generic };
  const { supabase, role } = await requireAdmin();
  if (role !== "owner") return { ok: false, error: presetErrors.NOT_ALLOWED };
  const { error } = await supabase.rpc("admin_publish_preset", { p_kind: parsed.data, p_id: id });
  if (error) return { ok: false, error: errorText(error.message, presetErrors) };
  revalidatePath("/admin/presets", "layout");
  return { ok: true };
}

// ------------------------------------------------------------------ demo data

/**
 * Owner only. Builds the same demo as `npm run seed:demo` (the database function creates the organisation, event, riders and officials;
 * then the ladder engine draws every division). Refuses while a demo organisation exists. Switched off by DEMO_SEED_DISABLED=1
 * (set that on any project that hosts a real event: the demo PINs are public).
 */
export async function createDemoOrganisation(): Promise<{ ok: true } | Failure> {
  if (process.env.DEMO_SEED_DISABLED === "1") return fail("NOT_ALLOWED");
  const { supabase, role } = await requireAdmin();
  if (role !== "owner") return fail("NOT_ALLOWED");
  const { error } = await supabase.rpc("admin_create_demo_organisation");
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  try {
    await drawDemoEvent(createServiceClient());
  } catch {
    return { ok: false, error: copy.admin.demo.drawFailed };
  }
  return { ok: true };
}

// ------------------------------------------------------------------ move an event

export interface MoveSummary {
  riders_copied: number;
  riders_reused: number;
  riders_removed: number;
  presets_copied: number;
}

/** Owner only. One database transaction; refused while a heat of the event is running or paused. The database writes the audit line. */
export async function moveEvent(eventId: string, targetOrgId: string): Promise<{ ok: true; summary: MoveSummary } | Failure> {
  if (!z.string().uuid().safeParse(eventId).success || !z.string().uuid().safeParse(targetOrgId).success) return fail();
  const { supabase, role } = await requireAdmin();
  if (role !== "owner") return fail("NOT_ALLOWED");
  const { data, error } = await supabase.rpc("admin_move_event", { p_event: eventId, p_target_org: targetOrgId });
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true, summary: data as unknown as MoveSummary };
}

// ------------------------------------------------------------------ feedback notes

/** "Export for Claude" (owner only): the notes of the list as it is filtered (open ones unless a status is chosen) as one Markdown text; each note gets today's export date. Nothing leaves the site by itself. */
export async function exportFeedbackNotes(filters: { tag?: string; status?: string; page?: string; event?: string; from?: string; to?: string } = {}): Promise<{ ok: true; markdown: string; count: number } | Failure> {
  const { supabase, role } = await requireAdmin();
  if (role !== "owner") return { ok: false, error: copy.feedback.exportOwnerOnly };
  const { loadNotes } = await import("@/lib/feedback/load");
  const { formatFeedbackMarkdown } = await import("@/lib/feedback/format");
  // the list's current filters decide; a list with no status filter exports the open notes (a done note is not exported again unless asked for)
  const { notes } = await loadNotes(supabase, { ...filters, status: filters.status || "open" }, { signLinks: 60 * 60 * 24 * 30 });
  const now = new Date();
  const markdown = formatFeedbackMarkdown(notes, now);
  if (notes.length) {
    const { error } = await supabase.from("feedback_notes").update({ exported_at: now.toISOString() }).in("id", notes.map((n) => n.id));
    if (error) return { ok: false, error: copy.feedback.failed };
  }
  revalidatePath("/admin/feedback");
  return { ok: true, markdown, count: notes.length };
}
