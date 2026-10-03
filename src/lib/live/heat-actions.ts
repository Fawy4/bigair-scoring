"use server";

import { z } from "zod";
import { errorSentence, parseError } from "./errors";
import { extendBreakPlan, holdPlan as holdPlanPure, resumeBreakPlan, resumePlanAt as resumePlanAtPure, shiftPlan as shiftPlanPure } from "./plan-actions";
import { buildHeatModel, type DivisionRowDb, type HeatRowDb, type RoundRowDb } from "@/lib/schedule/model";
import { parseEventSettings } from "@/lib/schemas/event-settings";
import { rowToPlan, type PlanRow } from "@/lib/schedule/plans";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export type ActionResult = { ok: true } | { ok: false; code: string | null; message: string };
/** A run order change answers with the hold and pins as they are now, so the screen can show them at once. */
export type PlanActionResult = { ok: true; hold: Json | null; anchors: Json } | { ok: false; code: string | null; message: string };

const uuid = z.string().uuid();
const fail = (code: string | null, message?: string): { ok: false; code: string | null; message: string } => ({ ok: false, code, message: message ?? errorSentence(code) });

/** Every heat change goes through the database's own functions (they check who may, the rules, and write the audit line). */
async function heatRpc(fn: "start_heat" | "pause_heat" | "resume_heat" | "end_heat" | "abort_start", heatId: string): Promise<ActionResult> {
  if (!uuid.safeParse(heatId).success) return fail("HEAT_NOT_FOUND");
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, { p_heat: heatId });
  return error ? { ok: false, code: parseError(error.message).code, message: errorSentence(error.message) } : { ok: true };
}

export async function startHeat(heatId: string): Promise<ActionResult> {
  return heatRpc("start_heat", heatId);
}
/** Start sequence (Flags): raises the yellow for `prestartSec` seconds (null = the event's default, 0 = start now); the heat then starts by itself, on the database's clock. */
export async function armHeat(heatId: string, prestartSec: number | null): Promise<ActionResult> {
  if (!uuid.safeParse(heatId).success) return fail("HEAT_NOT_FOUND");
  if (prestartSec !== null && (!Number.isInteger(prestartSec) || prestartSec < 0 || prestartSec > 600)) return fail("BAD_PRESTART");
  const supabase = await createClient();
  const { error } = await supabase.rpc("arm_heat", { p_heat: heatId, ...(prestartSec === null ? {} : { p_prestart: prestartSec }) });
  return error ? { ok: false, code: parseError(error.message).code, message: errorSentence(error.message) } : { ok: true };
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
export async function endHeat(heatId: string): Promise<ActionResult> {
  return heatRpc("end_heat", heatId);
}

export async function cancelHeat(heatId: string, reason: string): Promise<ActionResult> {
  if (!uuid.safeParse(heatId).success) return fail("HEAT_NOT_FOUND");
  if (reason.trim().length < 3) return fail("REASON_REQUIRED");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_heat", { p_heat: heatId, p_reason: reason.trim() });
  return error ? { ok: false, code: parseError(error.message).code, message: errorSentence(error.message) } : { ok: true };
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
