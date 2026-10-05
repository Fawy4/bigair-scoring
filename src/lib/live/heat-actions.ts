"use server";

import { z } from "zod";
import { errorSentence, parseError } from "./errors";
import { extendBreakPlan, holdPlan as holdPlanPure, resumeBreakPlan, resumePlanAt as resumePlanAtPure, shiftPlan as shiftPlanPure } from "./plan-actions";
import { setBreak as setBreakPlan, utcToLocalHHMM } from "@/lib/engine/schedule";
import { buildHeatModel, type DivisionRowDb, type HeatRowDb, type RoundRowDb } from "@/lib/schedule/model";
import { parseEventSettings } from "@/lib/schemas/event-settings";
import { rowToPlan, type PlanRow } from "@/lib/schedule/plans";
import { reasonOf } from "@/lib/reason";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { HEAT_COLUMNS, type HeatRow } from "./types";

/** `heat`: the heat as the database has it now (the heat functions return the row they changed), so the screen shows it without waiting for the stream. */
export type ActionResult = { ok: true; heat?: Partial<HeatRow> } | { ok: false; code: string | null; message: string };
/** A run order change answers with the hold and pins as they are now, so the screen can show them at once. */
export type PlanActionResult = { ok: true; hold: Json | null; anchors: Json; items?: Json } | { ok: false; code: string | null; message: string };

const uuid = z.string().uuid();
const HEAT_KEYS = HEAT_COLUMNS.split(", ");
/** The columns the screens use, out of the row a heat function returned. */
function heatOf(data: unknown): Partial<HeatRow> | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const row = data as Record<string, unknown>;
  return typeof row.id === "string" ? (Object.fromEntries(HEAT_KEYS.filter((k) => k in row).map((k) => [k, row[k]])) as Partial<HeatRow>) : undefined;
}
const fail = (code: string | null, message?: string): { ok: false; code: string | null; message: string } => ({ ok: false, code, message: message ?? errorSentence(code) });

/** Every heat change goes through the database's own functions (they check who may, the rules, and write the audit line). */
async function heatRpc(fn: "start_heat" | "pause_heat" | "resume_heat" | "end_heat" | "abort_start", heatId: string): Promise<ActionResult> {
  if (!uuid.safeParse(heatId).success) return fail("HEAT_NOT_FOUND");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, { p_heat: heatId });
  return error ? { ok: false, code: parseError(error.message).code, message: errorSentence(error.message) } : { ok: true, heat: heatOf(data) };
}

export async function startHeat(heatId: string): Promise<ActionResult> {
  return heatRpc("start_heat", heatId);
}
/** Start sequence (Flags): raises the yellow for `prestartSec` seconds (null = the event's default, 0 = start now); the heat then starts by itself, on the database's clock. */
export async function armHeat(heatId: string, prestartSec: number | null): Promise<ActionResult> {
  if (!uuid.safeParse(heatId).success) return fail("HEAT_NOT_FOUND");
  if (prestartSec !== null && (!Number.isInteger(prestartSec) || (prestartSec !== 0 && (prestartSec < 10 || prestartSec > 900)))) return fail("BAD_PRESTART");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("arm_heat", { p_heat: heatId, ...(prestartSec === null ? {} : { p_prestart: prestartSec }) });
  return error ? { ok: false, code: parseError(error.message).code, message: errorSentence(error.message) } : { ok: true, heat: heatOf(data) };
}
/** "+1 min": one more minute on the yellow (the database adds exactly 60 s to what is left, and writes it to the audit log). */
export async function extendPrestart(heatId: string): Promise<ActionResult> {
  if (!uuid.safeParse(heatId).success) return fail("HEAT_NOT_FOUND");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("extend_prestart", { p_heat: heatId });
  return error ? { ok: false, code: parseError(error.message).code, message: errorSentence(error.message) } : { ok: true, heat: heatOf(data) };
}
/**
 * "+1 min" on a heat that is running: the database adds exactly 60 s of heat time to what is left (6 s on a simulation at x10), as often as needed, and writes
 * "+1 min by ‹head seat› at ‹time›, heat now ends ‹time›" to the audit log. Refused (HEAT_NOT_RUNNING) when the heat is not running. Every screen follows the heat's row.
 */
export async function extendHeat(heatId: string): Promise<ActionResult> {
  if (!uuid.safeParse(heatId).success) return fail("HEAT_NOT_FOUND");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("extend_heat", { p_heat: heatId });
  return error ? { ok: false, code: parseError(error.message).code, message: errorSentence(error.message) } : { ok: true, heat: heatOf(data) };
}
export async function abortStart(heatId: string): Promise<ActionResult> {
  return heatRpc("abort_start", heatId);
}
export async function pauseHeat(heatId: string): Promise<ActionResult> {
  return heatRpc("pause_heat", heatId);
}
export async function resumeHeat(heatId: string): Promise<ActionResult> {
  return heatRpc("resume_heat", heatId);
}
/** End heat, after the console asked once. The reason is optional: with one it goes to the audit line (a second function of the same name, same checks and same move). */
export async function endHeat(heatId: string, reason?: string): Promise<ActionResult> {
  const why = (reason ?? "").trim().slice(0, 500);
  if (!why) return heatRpc("end_heat", heatId);
  if (!uuid.safeParse(heatId).success) return fail("HEAT_NOT_FOUND");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("end_heat", { p_heat: heatId, p_reason: why });
  return error ? { ok: false, code: parseError(error.message).code, message: errorSentence(error.message) } : { ok: true, heat: heatOf(data) };
}

export async function cancelHeat(heatId: string, reason: string): Promise<ActionResult> {
  if (!uuid.safeParse(heatId).success) return fail("HEAT_NOT_FOUND");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_heat", { p_heat: heatId, p_reason: reasonOf(reason) });
  return error ? { ok: false, code: parseError(error.message).code, message: errorSentence(error.message) } : { ok: true, heat: heatOf(data) };
}

// ---- the run order: Hold, Resume at and Shift on SERVER time (never the device's clock)
const PLAN_COLUMNS = "id, event_id, day, name, items, anchors, actual_starts, hold, defaults, active, updated_at";

async function loadPlan(planId: string) {
  const supabase = await createClient();
  const { data: row } = await supabase.from("schedule_plans").select(PLAN_COLUMNS).eq("id", planId).maybeSingle();
  if (!row) return null;
  const [{ data: event }, { data: divisions }, { data: rounds }, { data: heats }, { data: now }] = await Promise.all([
    supabase.from("events").select("timezone, settings").eq("id", row.event_id).maybeSingle(),
    supabase.from("divisions").select("id, name, sort_order, draw").eq("event_id", row.event_id),
    supabase.from("rounds").select("id, division_id, name, short_name, sort_order").eq("event_id", row.event_id),
    supabase.from("heats").select("id, division_id, round_id, draw_uid, number, name, status, started_at, ended_at, duration_sec, warm_up_sec, paused_total_sec").eq("event_id", row.event_id),
    supabase.rpc("server_now"),
  ]);
  const dp = rowToPlan(row as unknown as PlanRow, parseEventSettings(event?.settings).readyCallMin);
  const model = buildHeatModel((divisions ?? []) as DivisionRowDb[], (rounds ?? []) as RoundRowDb[], (heats ?? []) as HeatRowDb[]);
  return { supabase, row, plan: dp.plan, defaults: dp.defaults, timezone: event?.timezone ?? "Africa/Cairo", lives: model.lives, serverNow: typeof now === "string" ? now : new Date().toISOString() };
}

function planFailure(e: unknown): { ok: false; code: string | null; message: string } {
  const text = e instanceof Error ? e.message : "";
  if (/on hold/i.test(text) && /resume/i.test(text)) return fail("ON_HOLD");
  if (/not on hold/i.test(text)) return fail("NOT_ON_HOLD");
  if (/nothing left to shift/i.test(text)) return fail("NOTHING_TO_SHIFT");
  return fail(null, errorSentence(text));
}

/** Hold: from now on every un-started row is "held". The moment is the database's clock. */
export async function holdPlan(planId: string, reason?: string): Promise<PlanActionResult> {
  if (!uuid.safeParse(planId).success) return fail("PLAN_NOT_FOUND");
  const p = await loadPlan(planId);
  if (!p) return fail("PLAN_NOT_FOUND");
  const held = holdPlanPure(p.plan, p.serverNow, reason?.trim() || undefined);
  const { data, error } = await p.supabase.rpc("set_plan_hold", { p_plan: planId, p_hold: held.hold as unknown as Json, p_reason: reason?.trim() || undefined, p_expected: p.row.updated_at });
  return error ? { ok: false, code: parseError(error.message).code, message: errorSentence(error.message) } : { ok: true, hold: data?.hold ?? null, anchors: data?.anchors ?? {} };
}

/** Resume at HH:MM (event time): that restart pins the next heat that has not started, and clears the hold. */
export async function resumePlanAt(planId: string, hhmm: string): Promise<PlanActionResult> {
  if (!uuid.safeParse(planId).success) return fail("PLAN_NOT_FOUND");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return fail("BAD_PLAN_VALUE");
  const p = await loadPlan(planId);
  if (!p) return fail("PLAN_NOT_FOUND");
  if (!p.plan.hold) return fail("NOT_ON_HOLD");
  try {
    const resumed = resumePlanAtPure(p.plan, p.lives, p.row.day, hhmm, p.timezone);
    const { data, error } = await p.supabase.rpc("set_plan_hold", { p_plan: planId, p_hold: null, p_expected: p.row.updated_at, p_anchors: resumed.anchors as unknown as Json });
    return error ? { ok: false, code: parseError(error.message).code, message: errorSentence(error.message) } : { ok: true, hold: data?.hold ?? null, anchors: data?.anchors ?? {} };
  } catch (e) {
    return planFailure(e);
  }
}

/** Shift +N minutes: pins the next heat that has not started at its projected start + N. */
export async function shiftPlan(planId: string, minutes: number): Promise<PlanActionResult> {
  if (!uuid.safeParse(planId).success) return fail("PLAN_NOT_FOUND");
  if (!Number.isFinite(minutes) || Math.abs(minutes) > 240) return fail("BAD_PLAN_VALUE");
  const p = await loadPlan(planId);
  if (!p) return fail("PLAN_NOT_FOUND");
  try {
    const shifted = shiftPlanPure(p.plan, p.lives, minutes, { timezone: p.timezone, eventDay: p.row.day, defaults: p.defaults, serverNowIso: p.serverNow });
    const { data, error } = await p.supabase.rpc("set_plan_anchors", { p_plan: planId, p_anchors: shifted.anchors as unknown as Json, p_expected: p.row.updated_at });
    return error ? { ok: false, code: parseError(error.message).code, message: errorSentence(error.message) } : { ok: true, hold: data?.hold ?? null, anchors: data?.anchors ?? {} };
  } catch (e) {
    return planFailure(e);
  }
}

/** "+1 min" on the break after a heat: pins the next heat to start later by that many minutes (rounded up to a whole minute). Nothing starts by itself. */
export async function extendBreakAction(planId: string, minutes: number): Promise<PlanActionResult> {
  if (!uuid.safeParse(planId).success) return fail("PLAN_NOT_FOUND");
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 30) return fail("BAD_PLAN_VALUE");
  const p = await loadPlan(planId);
  if (!p) return fail("PLAN_NOT_FOUND");
  try {
    const next = extendBreakPlan(p.plan, p.lives, minutes, { timezone: p.timezone, eventDay: p.row.day, defaults: p.defaults, serverNowIso: p.serverNow });
    const { data, error } = await p.supabase.rpc("set_plan_anchors", { p_plan: planId, p_anchors: next.anchors as unknown as Json, p_expected: p.row.updated_at });
    return error ? { ok: false, code: parseError(error.message).code, message: errorSentence(error.message) } : { ok: true, hold: data?.hold ?? null, anchors: data?.anchors ?? {} };
  } catch (e) {
    return planFailure(e);
  }
}

/**
 * The break controls beside the red banner. "+1 min" adds exactly one minute to this break, "Other…" sets its length (end of the last heat to the next heat's start,
 * warm-up included). Both change the run order's own break (to the second), so the next heat's planned start, the Run order step, the public timetable and every
 * countdown move together; the change and any pin it replaced are in the audit log. Nothing starts by itself.
 */
export async function setBreakAction(planId: string, spec: { kind: "add"; minutes: number } | { kind: "length"; seconds: number }): Promise<PlanActionResult> {
  if (!uuid.safeParse(planId).success) return fail("PLAN_NOT_FOUND");
  if (spec.kind === "add" ? !(Number.isFinite(spec.minutes) && spec.minutes > 0 && spec.minutes <= 30) : !(Number.isFinite(spec.seconds) && spec.seconds >= 0 && spec.seconds <= 7200)) return fail("BAD_PLAN_VALUE");
  const p = await loadPlan(planId);
  if (!p) return fail("PLAN_NOT_FOUND");
  try {
    // a simulation's break is a tenth as long at x10: what is typed is the time on the clock, so the run order gets it multiplied by the speed
    const { data: ended } = await p.supabase.from("heats").select("time_scale").eq("event_id", p.row.event_id).not("ended_at", "is", null).order("ended_at", { ascending: false }).limit(1);
    const scale = Math.max(1, ended?.[0]?.time_scale ?? 1);
    const ctx = { timezone: p.timezone, eventDay: p.row.day, defaults: p.defaults, now: p.serverNow, timeScale: scale };
    const r = setBreakPlan(p.plan, p.lives, spec.kind === "add" ? { add: { minutes: spec.minutes } } : { length: { ms: spec.seconds * 1000 * scale } }, ctx);
    const why = spec.kind === "add" ? `Break +1 min: the next heat now starts ${utcToLocalHHMM(Date.parse(r.startUtc), p.timezone)}${r.replacedPin ? ` (the ${r.replacedPin} pin was replaced)` : ""}` : `Break set to ${Math.floor(spec.seconds / 60)}:${String(spec.seconds % 60).padStart(2, "0")}: the next heat now starts ${utcToLocalHHMM(Date.parse(r.startUtc), p.timezone)}${r.replacedPin ? ` (the ${r.replacedPin} pin was replaced)` : ""}`;
    const { data, error } = await p.supabase.rpc("set_plan_break", { p_plan: planId, p_item: r.prevItemId, p_break_min: r.breakMin, p_anchors: r.plan.anchors as unknown as Json, p_reason: why, p_expected: p.row.updated_at });
    return error ? { ok: false, code: parseError(error.message).code, message: errorSentence(error.message) } : { ok: true, hold: data?.hold ?? null, anchors: data?.anchors ?? {}, items: data?.items ?? undefined };
  } catch (e) {
    return planFailure(e);
  }
}

/** Resume after "Pause break": the same time is left as when the break was paused (rounded up to a whole minute). Clears the hold. */
export async function resumeBreakAction(planId: string): Promise<PlanActionResult> {
  if (!uuid.safeParse(planId).success) return fail("PLAN_NOT_FOUND");
  const p = await loadPlan(planId);
  if (!p) return fail("PLAN_NOT_FOUND");
  if (!p.plan.hold) return fail("NOT_ON_HOLD");
  try {
    const resumed = resumeBreakPlan(p.plan, p.lives, { timezone: p.timezone, eventDay: p.row.day, defaults: p.defaults, serverNowIso: p.serverNow });
    const { data, error } = await p.supabase.rpc("set_plan_hold", { p_plan: planId, p_hold: null, p_expected: p.row.updated_at, p_anchors: resumed.anchors as unknown as Json });
    return error ? { ok: false, code: parseError(error.message).code, message: errorSentence(error.message) } : { ok: true, hold: data?.hold ?? null, anchors: data?.anchors ?? {} };
  } catch (e) {
    return planFailure(e);
  }
}
