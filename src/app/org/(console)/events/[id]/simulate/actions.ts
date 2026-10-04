"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateDraw, lockDraw } from "../draw/actions";
import { resetEvent } from "../reset-actions";
import { generatePin, generateQrToken, joinUrl } from "@/lib/join/pin";
import { decryptPin, encryptPin, tryPinKey } from "@/lib/officials/pin-crypto";
import { joinAddress } from "@/lib/officials/share";
import { requestOrigin } from "@/lib/platform/origin";
import { isSpeed, parseSettingsPatch, withSettings, type SimSettings } from "@/lib/simulator/config";
import { simErrorSentence } from "@/lib/simulator/errors";
import { logLine, updateConfig } from "@/lib/simulator/io";
import { pressScenario, reviveJudge } from "@/lib/simulator/scenario-runner";
import { forgetContext, type SimDb } from "@/lib/simulator/snapshot";
import { loadSimStatus, type StatusResult } from "@/lib/simulator/status";
import { endAndPublish, simTick, skipToEnd, type TickResult } from "@/lib/simulator/tick";
import type { SeatRole } from "@/lib/simulator/types";
import { signedInUser } from "@/lib/supabase/claims";
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
  const me = await signedInUser(user);
  if (!me || me.isAnonymous) return null;
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
    // Start after Stop plays the day; Resume after Pause carries on in whichever mode it was (the day, or the whole event)
    if (state === "playing") {
      const { data } = await db.service.from("sim_control").select("state").eq("event_id", eventId).maybeSingle();
      if (data?.state === "stopped") await updateConfig(db, eventId, (c) => ({ ...c, wholeEvent: false }));
    }
    const { error } = await db.user.rpc("sim_set", { p_event: eventId, p_patch: { state, ...(state === "stopped" ? { blocker: null } : {}) } });
    if (error) return bad(simErrorSentence(error.message));
    // the heat clock lives in the database: Pause and Stop pause the heat on the water too, Start / Resume resumes the heats the simulator paused (Polish 2, item 3)
    if (state === "playing") {
      const resumed = await db.user.rpc("sim_resume_heats", { p_event: eventId });
      await logLine(db, eventId, "info", null, (resumed.data ?? 0) > 0 ? T.play.statePlayingResumed : T.play.statePlaying);
    } else {
      const paused = await db.user.rpc("sim_pause_heats", { p_event: eventId });
      if (paused.error) return bad(simErrorSentence(paused.error.message));
      if ((paused.data ?? 0) > 0) await logLine(db, eventId, "info", null, T.play.heatPaused);
    }
    return { ok: true };
  });
}

/** The log line for a Pause or Resume the panel already did straight in the database (so it did not wait behind a tick). */
export async function noteStateChange(eventId: string, state: "paused" | "playing", heats: number): Promise<Done> {
  return wrap(eventId, async (db) => {
    if (state === "paused") {
      if (heats > 0) await logLine(db, eventId, "info", null, T.play.heatPaused);
    } else await logLine(db, eventId, "info", null, heats > 0 ? T.play.statePlayingResumed : T.play.statePlaying);
    return { ok: true };
  });
}

/** "Run the whole event": every day's run order in turn until the finals are published, at the chosen speed (Polish 2, item 7). */
export async function runWholeEvent(eventId: string): Promise<Done> {
  return wrap(eventId, async (db) => {
    await updateConfig(db, eventId, (c) => ({ ...c, wholeEvent: true }));
    const { error } = await db.user.rpc("sim_set", { p_event: eventId, p_patch: { state: "playing", blocker: null } });
    if (error) return bad(simErrorSentence(error.message));
    await db.user.rpc("sim_resume_heats", { p_event: eventId });
    await logLine(db, eventId, "info", null, T.log.wholeStarted);
    return { ok: true };
  });
}

/** "Skip to end of heat": fast-forwards the virtual officials (every attempt logged and scored); the heat keeps running and waits for End heat. */
export async function skipToEndOfHeat(eventId: string): Promise<Done<{ text: string }>> {
  return wrap(eventId, async (db) => {
    const r = await skipToEnd(db, eventId);
    return r.ok ? { ok: true, text: r.text } : bad(r.message);
  });
}

/** "End heat and publish": ends the heat now; the virtual judges finish; the virtual head judge publishes if nothing blocks. */
export async function endHeatAndPublish(eventId: string): Promise<Done<{ text: string }>> {
  return wrap(eventId, async (db) => {
    const r = await endAndPublish(db, eventId);
    return r.ok ? { ok: true, text: r.text } : bad(r.message);
  });
}

export async function saveSettings(eventId: string, patch: Partial<SimSettings>): Promise<Done> {
  return wrap(eventId, async (db) => {
    // only the setting that was changed: the others stay exactly as they are (Polish 2, item 4)
    const parsed = parseSettingsPatch(patch);
    if (!parsed) return bad();
    await updateConfig(db, eventId, (c) => withSettings(c, parsed));
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

/**
 * Reset to the locked draw: the general Reset of the product (Phase 7a-1, the same one the Event step has), then the simulator's own leftovers (wind calls, shortened
 * clocks, a Plan B it made, the panel's numbers). A simulation is never public, so the written reason the general Reset asks for after a public result is given here.
 */
export async function resetSimulation(eventId: string, typedSlug: string): Promise<Done<{ attempts: number; results: number }>> {
  return wrap(eventId, async (db) => {
    const denied = await gate(db, eventId);
    if (denied) return bad(denied);
    const r = await resetEvent({ eventId, slug: typedSlug, reason: "Simulator reset" });
    if (!r.ok) return bad(r.error);
    const after = await db.user.rpc("sim_after_reset", { p_event: eventId });
    if (after.error) return bad(simErrorSentence(after.error.message));
    forgetContext(eventId);
    return { ok: true, attempts: r.counts.attempts, results: r.counts.published_results };
  });
}

/** For a simulation event with no starting draw copy (the Demo, played before Reset existed): wipe it, draw and lock every division again (locking takes the copy). */
export async function rebuildSimulation(eventId: string, typedSlug: string): Promise<Done<{ drawn: number; skipped: string[] }>> {
  return wrap(eventId, async (db) => {
    const wiped = await db.user.rpc("sim_rebuild", { p_event: eventId, p_slug_confirm: typedSlug });
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
    forgetContext(eventId);
    revalidatePath(`/org/events/${eventId}`, "layout");
    return { ok: true, drawn, skipped };
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

