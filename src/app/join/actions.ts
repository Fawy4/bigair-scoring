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
  const { data: event } = await service.from("events").select("id").eq("slug", slug.data).maybeSingle();
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return { ok: true as const, user, service, eventId: event?.id ?? null, ip };
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
