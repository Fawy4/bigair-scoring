"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { parseRegistration } from "@/lib/registration/form";
import { createServiceClient } from "@/lib/supabase/service";
import { copy } from "@/lib/ui-copy";

const Slug = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]*$/);
const T = copy.registration;
const ip = async () => (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

export type PhotoSlot = { ok: true; path: string; token: string } | { ok: false; error: string };

/** The phone asks for a place to put its (already shrunk) photo: only while registration is open, and not too often. */
export async function requestPhotoSlot(slugInput: string, ext: "jpg" | "png" | "webp"): Promise<PhotoSlot> {
  const slug = Slug.safeParse(slugInput);
  if (!slug.success) return { ok: false, error: T.photoFailed };
  const service = createServiceClient();
  const { data, error } = await service.rpc("request_photo_upload", { p_event_slug: slug.data, p_ext: ext, p_ip: await ip() });
  const r = data as { ok: boolean; error?: string; path?: string } | null;
  if (error || !r?.ok || !r.path) return { ok: false, error: r?.error === "RATE_LIMITED" ? T.rateLimited : T.photoFailed };
  const signed = await service.storage.from("rider-photos").createSignedUploadUrl(r.path);
  if (signed.error || !signed.data) return { ok: false, error: T.photoFailed };
  return { ok: true, path: r.path, token: signed.data.token };
}

export type Submitted = { ok: true } | { ok: false; error: string; field?: string };

const MESSAGES: Record<string, string> = {
  REGISTRATION_CLOSED: T.closedDefault,
  DIVISION_FULL: T.fullLine,
  RATE_LIMITED: T.rateLimited,
  EVENT_NOT_FOUND: T.notFound,
  DIVISION_NOT_FOUND: T.errors.division,
  CONSENT_REQUIRED: T.errors.consent,
  INVALID_PHOTO: T.photoFailed,
};

/** Creates (or matches, by email) the rider in the organisation and an entry in "registered": the organiser approves it in the Riders step. */
export async function submitRegistration(slugInput: string, input: unknown): Promise<Submitted> {
  const parsed = parseRegistration(input);
  if (!parsed.ok) {
    if (parsed.spam) return { ok: true }; // a script filled the hidden field: pretend it worked, store nothing
    const [field, message] = Object.entries(parsed.fields)[0] ?? ["form", T.failed];
    return { ok: false, error: message, field };
  }
  const slug = Slug.safeParse(slugInput);
  if (!slug.success) return { ok: false, error: T.notFound };
  const v = parsed.value;
  const identifiers: Record<string, unknown> = {};
  const kite = Object.fromEntries(
    Object.entries({ brand: v.kiteBrand, model: v.kiteModel, size: v.kiteSize, colours: v.kiteColours }).filter(([, x]) => typeof x === "string" && x.trim() !== ""),
  );
  if (Object.keys(kite).length) identifiers.kite = kite;
  if (v.rashguardColour) identifiers.rashguard_colour = v.rashguardColour;

  const { data, error } = await createServiceClient().rpc("register_rider", {
    p_event_slug: slug.data,
    p_division: v.divisionId,
    p_fields: { first_name: v.first, last_name: v.last, email: v.email, phone: v.phone, nationality: v.nationality, sponsor: v.sponsor, woo_id: v.wooId },
    p_identifiers: identifiers as never,
    p_consent: v.consent,
    p_ip: await ip(),
    p_photo_path: v.photoPath || undefined,
  });
  if (error) return { ok: false, error: T.failed };
  const r = data as { ok: boolean; error?: string; field?: string };
  if (r.ok) return { ok: true };
  if (r.error === "INVALID_FIELDS") return { ok: false, error: T.errors.field(r.field ?? ""), field: r.field };
  return { ok: false, error: MESSAGES[r.error ?? ""] ?? T.failed };
}
