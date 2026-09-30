"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isValidPin, normalizePin } from "@/lib/join/pin";

export type JoinResult = { ok: true; role: string; name: string } | { ok: false; error: string };

const Slug = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]*$/);

/** Shared by PIN and QR joins: who is asking (must be an anonymous phone session), which event, from which address. */
async function context(slugInput: string) {
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user) return { ok: false as const, error: "NO_SESSION" };
  if (!user.is_anonymous) return { ok: false as const, error: "ORGANISER_SESSION" };
  const slug = Slug.safeParse(slugInput);
  if (!slug.success) return { ok: false as const, error: "INVALID_PIN" };
  const service = createServiceClient();
  const { data: event } = await service.from("events").select("id, archived_at").eq("slug", slug.data).maybeSingle();
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return { ok: true as const, user, service, eventId: event && !event.archived_at ? event.id : null, ip }; // an archived event answers exactly like an unknown one
}

function toResult(data: unknown, error: { message: string } | null): JoinResult {
  if (error) return { ok: false, error: "UNKNOWN" };
  const r = data as { ok: boolean; error?: string; role?: string; name?: string };
  return r.ok ? { ok: true, role: r.role!, name: r.name! } : { ok: false, error: r.error ?? "UNKNOWN" };
}

export async function joinWithPin(input: { slug: string; pin: string }): Promise<JoinResult> {
  const ctx = await context(input.slug);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const pin = normalizePin(input.pin);
  if (!ctx.eventId || !isValidPin(pin)) return { ok: false, error: "INVALID_PIN" }; // same message for "no such event" and "bad PIN"
  const { data, error } = await ctx.service.rpc("bind_seat_by_pin", { p_event: ctx.eventId, p_pin: pin, p_user: ctx.user.id, p_ip: ctx.ip });
  return toResult(data, error);
}

export async function joinWithToken(input: { slug: string; token: string }): Promise<JoinResult> {
  const ctx = await context(input.slug);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  if (!ctx.eventId || input.token.length < 16 || input.token.length > 200) return { ok: false, error: "INVALID_TOKEN" };
  const { data, error } = await ctx.service.rpc("bind_seat_by_token", { p_event: ctx.eventId, p_token: input.token, p_user: ctx.user.id, p_ip: ctx.ip });
  return toResult(data, error);
}

const SelfAdd = z.object({
  slug: Slug,
  name: z.string().trim().min(2).max(60),
  role: z.enum(["judge", "spotter", "announcer"]),
  phone: z.string().trim().max(30).optional(),
  website: z.string().max(200).optional(), // hidden honeypot: people leave it empty
});

/** "Not on the list? Add your name": creates a pending seat (no PIN, no access) for the organiser to approve. */
export async function requestSeat(input: z.input<typeof SelfAdd>): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.website && input.website.trim() !== "") return { ok: true }; // a script filled the hidden field: pretend it worked, store nothing
  const parsed = SelfAdd.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { ok: false, error: field === "role" ? "INVALID_ROLE" : field === "phone" ? "INVALID_PHONE" : field === "slug" ? "EVENT_NOT_FOUND" : "INVALID_NAME" };
  }
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { data, error } = await createServiceClient().rpc("request_seat", { p_event_slug: parsed.data.slug, p_name: parsed.data.name, p_role: parsed.data.role, p_ip: ip, p_phone: parsed.data.phone || undefined });
  if (error) return { ok: false, error: "FAILED" };
  const r = data as { ok: boolean; error?: string };
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "FAILED" };
}
