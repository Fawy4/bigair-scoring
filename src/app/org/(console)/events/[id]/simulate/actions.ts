"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateDraw, lockDraw } from "../draw/actions";
import { generatePin, generateQrToken, joinUrl } from "@/lib/join/pin";
import { decryptPin, encryptPin, tryPinKey } from "@/lib/officials/pin-crypto";
import { joinAddress } from "@/lib/officials/share";
import { requestOrigin } from "@/lib/platform/origin";
import { isSpeed, SimConfigSchema, withSettings, type SimSettings } from "@/lib/simulator/config";
import { simErrorSentence } from "@/lib/simulator/errors";
import { logLine, updateConfig } from "@/lib/simulator/io";
import { pressScenario, reviveJudge } from "@/lib/simulator/scenario-runner";
import { forgetContext, type SimDb } from "@/lib/simulator/snapshot";
import { loadSimStatus, type StatusResult } from "@/lib/simulator/status";
import { simTick, type TickResult } from "@/lib/simulator/tick";
import type { SeatRole } from "@/lib/simulator/types";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { copy } from "@/lib/ui-copy";

const T = copy.simulator;
export type Done<R extends object = object> = ({ ok: true } & R) | { ok: false; message: string };
const Uuid = z.string().uuid();
const bad = (message = T.generic): { ok: false; message: string } => ({ ok: false, message });

/** The organiser and the server's own connection. The database decides whether this person may touch this event (organiser, simulation event) on every call. */
async function open(): Promise<SimDb | null> {
  const user = await createClient();
  const {
    data: { user: me },
  } = await user.auth.getUser();
  if (!me || me.is_anonymous) return null;
  return { user, service: createServiceClient(), userId: me.id };
}

/** Before anything that reads with the server's key: the database confirms this person is an organiser of this simulation event. */
async function gate(db: SimDb, eventId: string): Promise<string | null> {
  const r = await db.user.rpc("sim_stats", { p_event: eventId });
  return r.error ? simErrorSentence(r.error.message) : null;
}

const wrap = async <R extends object>(eventId: string, run: (db: SimDb) => Promise<Done<R>>): Promise<Done<R>> => {
  if (!Uuid.safeParse(eventId).success) return bad();
  const db = await open();
  if (!db) return bad(T.errors.NOT_ALLOWED());
  try {
    return await run(db);
  } catch (e) {
    return bad(e instanceof Error ? simErrorSentence(e.message) : T.generic);
  }
};

export async function getSimStatus(eventId: string): Promise<StatusResult> {
  if (!Uuid.safeParse(eventId).success) return { kind: "denied" };
  const db = await open();
  if (!db) return { kind: "denied" };
  return loadSimStatus(db, eventId);
}

/** A fresh PIN that no other seat of the event holds, kept encrypted so View as can show it. */
async function issuePin(db: SimDb, seatId: string): Promise<string | null> {
  const key = tryPinKey();
  if (!key) return null;
  for (let i = 0; i < 8; i++) {
    const pin = generatePin();
    const { error } = await db.service.rpc("set_seat_pin", { p_seat: seatId, p_pin: pin, p_enc: encryptPin(pin, key) });
    if (!error) return pin;
    if (!error.message.includes("PIN_IN_USE")) return null;
  }
  return null;
}

/** "Run as simulation": copies the event into a new simulation event, then gives every official a fresh PIN. */
export async function cloneAsSimulation(eventId: string, name: string): Promise<Done<{ id: string; name: string; slug: string; divisions: number; locked: number }>> {
  if (!Uuid.safeParse(eventId).success) return bad();
  const db = await open();
  if (!db) return bad(T.errors.NOT_ALLOWED());
  const { data, error } = await db.user.rpc("clone_event_as_simulation", { p_event: eventId, p_name: name.trim() || undefined });
  if (error) return bad(simErrorSentence(error.message));
  const made = data as { event_id: string; slug: string; name: string; divisions: number; locked: number; seats: Array<{ seat_id: string }> };
  for (const s of made.seats) await issuePin(db, s.seat_id);
  revalidatePath("/org", "layout");
  return { ok: true, id: made.event_id, name: made.name, slug: made.slug, divisions: made.divisions, locked: made.locked };
}

/** Sets up the simulator for a simulation event that was not made by "Run as simulation" (the Demo). */
export async function enableSimulator(eventId: string): Promise<Done> {
  return wrap(eventId, async (db) => {
    const { error } = await db.user.rpc("sim_enable", { p_event: eventId });
    return error ? bad(simErrorSentence(error.message)) : { ok: true };
  });
}

export async function setSpeed(eventId: string, speed: number): Promise<Done> {
  return wrap(eventId, async (db) => {
    if (!isSpeed(speed)) return bad(T.errors.BAD_SPEED());
    const { error } = await db.user.rpc("sim_set", { p_event: eventId, p_patch: { speed } });
    return error ? bad(simErrorSentence(error.message)) : { ok: true };
  });
}

export async function setPlayState(eventId: string, state: "playing" | "paused" | "stopped"): Promise<Done> {
  return wrap(eventId, async (db) => {
    const { error } = await db.user.rpc("sim_set", { p_event: eventId, p_patch: { state, ...(state === "stopped" ? { blocker: null } : {}) } });
    if (error) return bad(simErrorSentence(error.message));
    if (state === "playing") await logLine(db, eventId, "info", null, T.play.statePlaying);
    return { ok: true };
  });
}

export async function saveSettings(eventId: string, patch: Partial<SimSettings>): Promise<Done> {
  return wrap(eventId, async (db) => {
    const parsed = SimConfigSchema.pick({ attemptsPerRider: true, crashShare: true, repeatShare: true, spread: true, judgeMode: true, specialJudge: true, missShare: true, offlineSec: true, lateSec: true }).partial().safeParse(patch);
    if (!parsed.success) return bad();
    await updateConfig(db, eventId, (c) => withSettings(c, parsed.data));
    return { ok: true };
  });
}

export async function setSeatMode(eventId: string, seatId: string, mode: "virtual" | "real"): Promise<Done> {
  return wrap(eventId, async (db) => {
    if (!Uuid.safeParse(seatId).success) return bad();
    const { error } = await db.user.rpc("sim_set_mode", { p_seat: seatId, p_mode: mode });
    return error ? bad(simErrorSentence(error.message)) : { ok: true };
  });
}

export async function tick(eventId: string): Promise<TickResult> {
  if (!Uuid.safeParse(eventId).success) return { ok: false, message: T.generic };
  const db = await open();
  if (!db) return { ok: false, message: T.errors.NOT_ALLOWED() };
  return simTick(db, eventId);
}

export async function pressScenarioButton(eventId: string, key: string): Promise<Done<{ armed: boolean; text: string }>> {
  return wrap(eventId, async (db) => {
    const r = await pressScenario(db, eventId, key);
    return r.ok ? { ok: true, armed: r.armed, text: r.text } : bad(r.message);
  });
}

export async function judgeIsBack(eventId: string): Promise<Done> {
  return wrap(eventId, async (db) => {
    const r = await reviveJudge(db, eventId);
    return r.ok ? { ok: true } : bad(r.message);
  });
}

/** Reset to the locked draw. The database checks the typed web address, that no heat is running, and that a starting point is saved. */
export async function resetSimulation(eventId: string, typedSlug: string): Promise<Done<{ attempts: number; results: number }>> {
  return wrap(eventId, async (db) => {
    const { data, error } = await db.user.rpc("sim_reset", { p_event: eventId, p_slug_confirm: typedSlug, p_rebuild: false });
    if (error) return bad(simErrorSentence(error.message));
    forgetContext(eventId);
    const c = data as { attempts?: number; results?: number } | null;
    return { ok: true, attempts: c?.attempts ?? 0, results: c?.results ?? 0 };
  });
}

/** For an event with no saved starting point (the Demo, played before the simulator existed): wipe it, draw and lock every division again, save that as the starting point. */
export async function rebuildSimulation(eventId: string, typedSlug: string): Promise<Done<{ drawn: number; skipped: string[] }>> {
  return wrap(eventId, async (db) => {
    const wiped = await db.user.rpc("sim_reset", { p_event: eventId, p_slug_confirm: typedSlug, p_rebuild: true });
    if (wiped.error) return bad(simErrorSentence(wiped.error.message));
    const { data: divisions } = await db.service.from("divisions").select("id, name").eq("event_id", eventId).order("sort_order");
    let drawn = 0;
    const skipped: string[] = [];
    for (const d of divisions ?? []) {
      const g = await generateDraw(d.id, false);
      const l = g.ok ? await lockDraw(d.id) : g;
      if (g.ok && l.ok) drawn++;
      else skipped.push(d.name);
    }
    await db.user.rpc("sim_capture_baseline", { p_event: eventId });
    forgetContext(eventId);
    revalidatePath(`/org/events/${eventId}`, "layout");
    return { ok: true, drawn, skipped };
  });
}

export async function saveStartingPoint(eventId: string): Promise<Done> {
  return wrap(eventId, async (db) => {
    const { error } = await db.user.rpc("sim_capture_baseline", { p_event: eventId });
    return error ? bad(simErrorSentence(error.message)) : { ok: true };
  });
}

/** Deletes a simulation made by "Run as simulation" (never the event it came from), and removes the simulator's own logins. */
export async function deleteSimulation(eventId: string, typedSlug: string): Promise<Done> {
  return wrap(eventId, async (db) => {
    const { data, error } = await db.user.rpc("sim_delete", { p_event: eventId, p_slug_confirm: typedSlug });
    if (error) return bad(simErrorSentence(error.message));
    const users = ((data as { users?: string[] } | null)?.users ?? []).filter((u) => Uuid.safeParse(u).success);
    for (const u of users) await db.service.auth.admin.deleteUser(u).catch(() => undefined);
    forgetContext(eventId);
    revalidatePath("/org", "layout");
    return { ok: true };
  });
}

/** Lets go of the seat View as gave to the organiser's sign-in. */
export async function releaseSeat(eventId: string): Promise<Done> {
  return wrap(eventId, async (db) => {
    const { error } = await db.user.rpc("sim_view_as", { p_event: eventId, p_seat: null as never });
    return error ? bad(simErrorSentence(error.message)) : { ok: true };
  });
}

export interface SeatJoinInfo {
  seatId: string;
  name: string;
  role: SeatRole;
  pin: string | null;
  joinUrl: string;
  qrUrl: string | null;
}

/** What a phone needs to take a seat: the PIN (when it is kept), the join address and a single-use QR link. */
export async function seatJoinInfo(eventId: string, seatId: string, makePin = false): Promise<Done<{ info: SeatJoinInfo }>> {
  return wrap(eventId, async (db) => {
    if (!Uuid.safeParse(seatId).success) return bad();
    const denied = await gate(db, eventId);
    if (denied) return bad(denied);
    const { data: seat } = await db.service.from("judge_seats").select("id, name, role, pin_enc, event_id, events(slug, end_date)").eq("id", seatId).eq("event_id", eventId).maybeSingle();
    if (!seat) return bad(T.errors.SEAT_NOT_FOUND());
    const key = tryPinKey();
    let pin: string | null = null;
    if (makePin) {
      if (!key) return bad(T.errors.NO_KEY());
      pin = await issuePin(db, seatId);
    } else if (seat.pin_enc && key) pin = decryptPin(seat.pin_enc, key);
    const origin = await requestOrigin();
    const slug = seat.events?.slug ?? "";
    const token = generateQrToken();
    const expires = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const { error } = await db.service.rpc("set_seat_qr", { p_seat: seatId, p_token: token, p_expires: expires });
    return { ok: true, info: { seatId, name: seat.name, role: seat.role as SeatRole, pin, joinUrl: joinAddress(origin, slug), qrUrl: error ? null : joinUrl(origin, slug, token) } };
  });
}

