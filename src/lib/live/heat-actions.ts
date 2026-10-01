"use server";

import { z } from "zod";
import { errorSentence, parseError } from "./errors";
import { holdPlan as holdPlanPure, resumePlanAt as resumePlanAtPure, shiftPlan as shiftPlanPure } from "./plan-actions";
import { buildHeatModel, type DivisionRowDb, type HeatRowDb, type RoundRowDb } from "@/lib/schedule/model";
import { rowToPlan, type PlanRow } from "@/lib/schedule/plans";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export type ActionResult = { ok: true } | { ok: false; code: string | null; message: string };

const uuid = z.string().uuid();
const fail = (code: string | null, message?: string): ActionResult => ({ ok: false, code, message: message ?? errorSentence(code) });

/** Every heat change goes through the database's own functions (they check who may, the rules, and write the audit line). */
async function heatRpc(fn: "start_heat" | "pause_heat" | "resume_heat" | "end_heat", heatId: string): Promise<ActionResult> {
  if (!uuid.safeParse(heatId).success) return fail("HEAT_NOT_FOUND");
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, { p_heat: heatId });
  return error ? { ok: false, code: parseError(error.message).code, message: errorSentence(error.message) } : { ok: true };
}

export const startHeat = (heatId: string) => heatRpc("start_heat", heatId);
export const pauseHeat = (heatId: string) => heatRpc("pause_heat", heatId);
export const resumeHeat = (heatId: string) => heatRpc("resume_heat", heatId);
export const endHeat = (heatId: string) => heatRpc("end_heat", heatId);

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
    supabase.from("events").select("timezone").eq("id", row.event_id).maybeSingle(),
    supabase.from("divisions").select("id, name, sort_order, draw").eq("event_id", row.event_id),
    supabase.from("rounds").select("id, division_id, name, short_name, sort_order").eq("event_id", row.event_id),
    supabase.from("heats").select("id, division_id, round_id, draw_uid, number, name, status, started_at, ended_at, duration_sec, warm_up_sec, paused_total_sec").eq("event_id", row.event_id),
    supabase.rpc("server_now"),
  ]);
  const dp = rowToPlan(row as unknown as PlanRow);
  const model = buildHeatModel((divisions ?? []) as DivisionRowDb[], (rounds ?? []) as RoundRowDb[], (heats ?? []) as HeatRowDb[]);
  return { supabase, row, plan: dp.plan, defaults: dp.defaults, timezone: event?.timezone ?? "Africa/Cairo", lives: model.lives, serverNow: typeof now === "string" ? now : new Date().toISOString() };
}

function planFailure(e: unknown): ActionResult {
  const text = e instanceof Error ? e.message : "";
  if (/on hold/i.test(text) && /resume/i.test(text)) return fail("ON_HOLD");
  if (/not on hold/i.test(text)) return fail("NOT_ON_HOLD");
  if (/nothing left to shift/i.test(text)) return fail("NOTHING_TO_SHIFT");
  return fail(null, errorSentence(text));
}

/** Hold: from now on every un-started row is "held". The moment is the database's clock. */
export async function holdPlan(planId: string, reason?: string): Promise<ActionResult> {
  if (!uuid.safeParse(planId).success) return fail("PLAN_NOT_FOUND");
  const p = await loadPlan(planId);
  if (!p) return fail("PLAN_NOT_FOUND");
  const held = holdPlanPure(p.plan, p.serverNow, reason?.trim() || undefined);
  const { error } = await p.supabase.rpc("set_plan_hold", { p_plan: planId, p_hold: held.hold as unknown as Json, p_reason: reason?.trim() || undefined, p_expected: p.row.updated_at });
  return error ? { ok: false, code: parseError(error.message).code, message: errorSentence(error.message) } : { ok: true };
}

/** Resume at HH:MM (event time): that restart pins the next heat that has not started, and clears the hold. */
export async function resumePlanAt(planId: string, hhmm: string): Promise<ActionResult> {
  if (!uuid.safeParse(planId).success) return fail("PLAN_NOT_FOUND");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return fail("BAD_PLAN_VALUE");
  const p = await loadPlan(planId);
  if (!p) return fail("PLAN_NOT_FOUND");
  if (!p.plan.hold) return fail("NOT_ON_HOLD");
  try {
    const resumed = resumePlanAtPure(p.plan, p.lives, p.row.day, hhmm, p.timezone);
    const { error } = await p.supabase.rpc("set_plan_hold", { p_plan: planId, p_hold: null, p_expected: p.row.updated_at, p_anchors: resumed.anchors as unknown as Json });
    return error ? { ok: false, code: parseError(error.message).code, message: errorSentence(error.message) } : { ok: true };
  } catch (e) {
    return planFailure(e);
  }
}

/** Shift +N minutes: pins the next heat that has not started at its projected start + N. */
export async function shiftPlan(planId: string, minutes: number): Promise<ActionResult> {
  if (!uuid.safeParse(planId).success) return fail("PLAN_NOT_FOUND");
  if (!Number.isFinite(minutes) || Math.abs(minutes) > 240) return fail("BAD_PLAN_VALUE");
  const p = await loadPlan(planId);
  if (!p) return fail("PLAN_NOT_FOUND");
  try {
    const shifted = shiftPlanPure(p.plan, p.lives, minutes, { timezone: p.timezone, eventDay: p.row.day, defaults: p.defaults, serverNowIso: p.serverNow });
    const { error } = await p.supabase.rpc("set_plan_anchors", { p_plan: planId, p_anchors: shifted.anchors as unknown as Json, p_expected: p.row.updated_at });
    return error ? { ok: false, code: parseError(error.message).code, message: errorSentence(error.message) } : { ok: true };
  } catch (e) {
    return planFailure(e);
  }
}
