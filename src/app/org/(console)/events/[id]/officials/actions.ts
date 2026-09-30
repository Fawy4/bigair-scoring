"use server";

import { z } from "zod";
import { getOrgContext } from "@/lib/org/context";
import { generatePin, generateQrToken, joinUrl } from "@/lib/join/pin";
import { decryptPin, encryptPin, tryPinKey } from "@/lib/officials/pin-crypto";
import { joinAddress } from "@/lib/officials/share";
import { requestOrigin } from "@/lib/platform/origin";
import { createServiceClient } from "@/lib/supabase/service";
import { copy } from "@/lib/ui-copy";

const T = copy.officials.errors;
export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const Uuid = z.string().uuid();

/** What the PIN box shows: the PIN, the join address, a single-use QR link, and a ready WhatsApp text. */
export interface IssuedPin {
  seatId: string;
  seatName: string;
  role: string;
  pin: string;
  joinUrl: string;
  qrUrl: string | null;
}

async function seatOf(seatId: string) {
  if (!Uuid.safeParse(seatId).success) return null;
  const { supabase, user } = await getOrgContext();
  // the caller's own rights decide whether this seat is theirs to touch
  const { data } = await supabase.from("judge_seats").select("id, event_id, name, role, status, events(slug, name, end_date)").eq("id", seatId).maybeSingle();
  return data ? { supabase, user, seat: data } : null;
}

/** A fresh PIN that no other seat of the event holds: tries a few times, then gives up. */
async function withFreshPin<R extends { ok: boolean; error?: string }>(attempt: (pin: string, enc: string) => Promise<R>): Promise<{ pin: string; result: R } | null> {
  const key = tryPinKey();
  if (!key) return null;
  for (let i = 0; i < 8; i++) {
    const pin = generatePin();
    const result = await attempt(pin, encryptPin(pin, key));
    if (result.ok || result.error !== "PIN_IN_USE") return { pin, result };
  }
  return null;
}

/** QR links expire one day after the last day of the event (docs/06 decision 9). */
function qrExpiry(endDate: string | null): string {
  const base = endDate ? new Date(`${endDate}T23:59:59Z`).getTime() : Date.now() + 7 * 86_400_000;
  return new Date(Math.max(base, Date.now() + 86_400_000) + 86_400_000).toISOString();
}

async function issue(seat: { id: string; name: string; role: string; events: { slug: string; end_date: string | null } | null }, pin: string): Promise<IssuedPin> {
  const origin = await requestOrigin();
  const slug = seat.events?.slug ?? "";
  const service = createServiceClient();
  const token = generateQrToken();
  const { error } = await service.rpc("set_seat_qr", { p_seat: seat.id, p_token: token, p_expires: qrExpiry(seat.events?.end_date ?? null) });
  return { seatId: seat.id, seatName: seat.name, role: seat.role, pin, joinUrl: joinAddress(origin, slug), qrUrl: error ? null : joinUrl(origin, slug, token) };
}

const NewSeat = z.object({
  eventId: Uuid,
  name: z.string().trim().min(2, T.nameRequired).max(60, T.nameRequired),
  role: z.enum(["judge", "head", "spotter", "announcer"]),
  headAlsoScores: z.boolean().optional(),
});

/** Adds a seat and gives it a PIN, shown in full once in the box (and kept encrypted for "Show PIN" and "Print cards"). */
export async function addSeat(input: z.input<typeof NewSeat>): Promise<Result<{ issued: IssuedPin }>> {
  const parsed = NewSeat.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? T.failed);
  const v = parsed.data;
  if (!tryPinKey()) return fail(T.noKey);
  const { supabase } = await getOrgContext();
  const scores = v.role === "head" && v.headAlsoScores === true;
  const { data: seat, error } = await supabase.from("judge_seats").insert({ event_id: v.eventId, name: v.name, role: v.role, scores: false, status: "active", active: true }).select("id, name, role, events(slug, end_date)").single();
  if (error || !seat) return fail(/row-level|permission/i.test(error?.message ?? "") ? T.notAllowed : T.failed);

  const service = createServiceClient();
  const made = await withFreshPin(async (pin, enc) => {
    const { error: e } = await service.rpc("set_seat_pin", { p_seat: seat.id, p_pin: pin, p_enc: enc });
    return { ok: !e, error: e?.message.includes("PIN_IN_USE") ? "PIN_IN_USE" : e?.message };
  });
  if (!made || !made.result.ok) {
    await supabase.from("judge_seats").delete().eq("id", seat.id); // never leave a seat without a way in
    return fail(T.pinInUse);
  }
  if (scores) await supabase.rpc("set_seat_scores", { p_seat: seat.id, p_scores: true });
  return { ok: true, issued: await issue(seat, made.pin) };
}

/** "Show PIN": reads the PIN back for one seat (server side only; the browser never gets the key). */
export async function revealPin(seatId: string): Promise<Result<{ pin: string }>> {
  const found = await seatOf(seatId);
  if (!found) return fail(T.unknownSeat);
  const { data } = await createServiceClient().from("judge_seats").select("pin_enc").eq("id", seatId).maybeSingle();
  if (!data?.pin_enc) return fail(copy.officials.pinUnknown);
  const key = tryPinKey();
  if (!key) return fail(T.noKey);
  const pin = decryptPin(data.pin_enc, key);
  return pin ? { ok: true, pin } : fail(copy.officials.pinCouldNotRead);
}

/** "Regenerate PIN": the old PIN stops working and the seat's phones are signed out; refused while that seat is in a running heat. */
export async function regeneratePin(seatId: string): Promise<Result<{ issued: IssuedPin }>> {
  const found = await seatOf(seatId);
  if (!found) return fail(T.unknownSeat);
  if (!tryPinKey()) return fail(T.noKey);
  const service = createServiceClient();
  const made = await withFreshPin(async (pin, enc) => {
    const { data, error } = await service.rpc("regenerate_seat_pin", { p_seat: seatId, p_pin: pin, p_enc: enc, p_actor: found.user.id });
    if (error) return { ok: false as const, error: "FAILED" };
    return data as { ok: boolean; error?: string; heat_number?: number; division?: string };
  });
  if (!made) return fail(T.pinInUse);
  const r = made.result as { ok: boolean; error?: string; heat_number?: number };
  if (!r.ok) return fail(r.error === "SEAT_IN_HEAT" ? copy.officials.inHeat(`Heat ${r.heat_number ?? ""}`.trim()) : r.error === "NOT_ACTIVE" ? T.notPending : T.failed);
  return { ok: true, issued: await issue(found.seat, made.pin) };
}

/** Approve a self-added seat: it becomes active and gets its PIN. */
export async function approveSeat(seatId: string): Promise<Result<{ issued: IssuedPin }>> {
  const found = await seatOf(seatId);
  if (!found) return fail(T.unknownSeat);
  if (found.seat.status !== "pending") return fail(T.notPending);
  if (!tryPinKey()) return fail(T.noKey);
  const service = createServiceClient();
  const made = await withFreshPin(async (pin, enc) => {
    const { data, error } = await service.rpc("approve_seat", { p_seat: seatId, p_pin: pin, p_enc: enc, p_actor: found.user.id });
    if (error) return { ok: false as const, error: "FAILED" };
    return data as { ok: boolean; error?: string };
  });
  if (!made) return fail(T.pinInUse);
  if (!made.result.ok) return fail(made.result.error === "NOT_PENDING" ? T.notPending : T.failed);
  return { ok: true, issued: await issue(found.seat, made.pin) };
}

/** Decline a self-added seat: it is removed. */
export async function declineSeat(seatId: string): Promise<Result> {
  const found = await seatOf(seatId);
  if (!found) return fail(T.unknownSeat);
  if (found.seat.status !== "pending") return fail(T.notPending);
  const { error } = await found.supabase.from("judge_seats").delete().eq("id", seatId).eq("status", "pending");
  return error ? fail(T.failed) : { ok: true };
}

const SeatPatch = z.object({ name: z.string().trim().min(2, T.nameRequired).max(60, T.nameRequired).optional(), active: z.boolean().optional() });

/** Rename a seat or switch it off / on (a switched-off seat is cut off at once). */
export async function updateSeat(seatId: string, patch: z.input<typeof SeatPatch>): Promise<Result> {
  const found = await seatOf(seatId);
  if (!found) return fail(T.unknownSeat);
  const parsed = SeatPatch.safeParse(patch);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? T.failed);
  const { data, error } = await found.supabase.from("judge_seats").update(parsed.data).eq("id", seatId).select("id");
  return error || !data?.length ? fail(T.failed) : { ok: true };
}

export async function deleteSeat(seatId: string): Promise<Result> {
  const found = await seatOf(seatId);
  if (!found) return fail(T.unknownSeat);
  const { error } = await found.supabase.from("judge_seats").delete().eq("id", seatId);
  return error ? fail(error.code === "23503" ? T.hasScores : T.failed) : { ok: true };
}

/** "Head judge also scores": on puts the head judge on every panel, off takes them out of all. */
export async function setHeadScores(seatId: string, scores: boolean): Promise<Result> {
  const found = await seatOf(seatId);
  if (!found) return fail(T.unknownSeat);
  const { error } = await found.supabase.rpc("set_seat_scores", { p_seat: seatId, p_scores: scores });
  return error ? fail(/NOT_ALLOWED/.test(error.message) ? T.notAllowed : T.failed) : { ok: true };
}

/** The judges of one division (head judge included when ticked). */
export async function savePanel(divisionId: string, seatIds: string[]): Promise<Result> {
  if (!Uuid.safeParse(divisionId).success) return fail(T.failed);
  const ids = z.array(Uuid).max(50).safeParse(seatIds);
  if (!ids.success) return fail(T.failed);
  const { supabase } = await getOrgContext();
  const { error } = await supabase.rpc("set_division_panel", { p_division: divisionId, p_seat_ids: ids.data });
  return error ? fail(/NOT_ALLOWED/.test(error.message) ? T.notAllowed : T.failed) : { ok: true };
}

/** A spotter is free (null) or assigned to riders (entry ids) and/or lycra colours (palette keys). */
export async function saveSpotterAssignment(seatId: string, entryIds: string[] | null, colours: string[] = []): Promise<Result> {
  const found = await seatOf(seatId);
  if (!found) return fail(T.unknownSeat);
  let value: { entries: string[]; colours: string[] } | null = null;
  if (entryIds !== null) {
    const ids = z.array(Uuid).max(500).safeParse(entryIds);
    const cols = z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).max(30).safeParse(colours);
    if (!ids.success || !cols.success) return fail(T.failed);
    value = { entries: ids.data, colours: cols.data };
  }
  const { data, error } = await found.supabase.from("judge_seats").update({ spotter_assignment: value as never }).eq("id", seatId).eq("role", "spotter").select("id");
  return error || !data?.length ? fail(T.failed) : { ok: true };
}

export interface CardData {
  seatId: string;
  seatName: string;
  role: string;
  pin: string | null;
  qrUrl: string | null;
}

/**
 * For the printable cards: the PIN of each seat (read back, never changed) and a fresh single-use QR code. Making a new QR code
 * means an older printed QR code stops working; PINs stay and nobody is signed out.
 */
export async function prepareCards(eventId: string, seatId: string | null): Promise<Result<{ eventName: string; joinUrl: string; cards: CardData[] }>> {
  if (!Uuid.safeParse(eventId).success || (seatId !== null && !Uuid.safeParse(seatId).success)) return fail(T.failed);
  const { supabase } = await getOrgContext();
  const { data: event } = await supabase.from("events").select("id, name, slug, end_date").eq("id", eventId).maybeSingle();
  if (!event) return fail(T.notAllowed);
  let query = supabase.from("judge_seats").select("id, name, role, created_at").eq("event_id", eventId).eq("status", "active").eq("active", true).order("created_at");
  if (seatId) query = query.eq("id", seatId);
  const { data: seats } = await query;
  const service = createServiceClient();
  const { data: stored } = await service.from("judge_seats").select("id, pin_enc").in("id", (seats ?? []).map((s) => s.id));
  const pins = new Map((stored ?? []).map((s) => [s.id, s.pin_enc]));
  const key = tryPinKey(); // without a key the cards still print, each saying that its PIN cannot be shown
  const origin = await requestOrigin();
  const order = { head: 0, judge: 1, spotter: 2, announcer: 3 } as Record<string, number>;
  const cards: CardData[] = [];
  for (const s of [...(seats ?? [])].sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9) || a.name.localeCompare(b.name, "en"))) {
    const enc = pins.get(s.id);
    const token = generateQrToken();
    const { error } = await service.rpc("set_seat_qr", { p_seat: s.id, p_token: token, p_expires: qrExpiry(event.end_date) });
    cards.push({ seatId: s.id, seatName: s.name, role: s.role, pin: enc && key ? decryptPin(enc, key) : null, qrUrl: error ? null : joinUrl(origin, event.slug, token) });
  }
  return { ok: true, eventName: event.name, joinUrl: joinAddress(origin, event.slug), cards };
}
