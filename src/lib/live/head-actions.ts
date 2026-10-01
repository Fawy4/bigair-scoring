"use server";

import { z } from "zod";
import { errorSentence, parseError } from "./errors";
import { checkImpression, checkTrickScore } from "./head-validate";
import { defaultKeep } from "./merge-plan";
import { publishHeatCore, type PublishResult } from "./publish-core";
import { mergeOverrides, SCORING_NULLABLE } from "@/lib/scoring-ui/overrides";
import { rowToPlan, type PlanRow } from "@/lib/schedule/plans";
import type { RunItem } from "@/lib/schemas/schedule";
import { insertRerunItem, rerunName } from "./rerun";
import { parseScoringModel, type ScoringModel } from "@/lib/schemas/scoring-model";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/database.types";

export type HeadResult = { ok: true } | { ok: false; code: string | null; message: string };
export type { PublishResult };

const uuid = z.string().uuid();
type Failure = { ok: false; code: string | null; message: string };
const fail = (code: string | null, message?: string): Failure => ({ ok: false, code, message: message ?? errorSentence(code) });
const from = (error: { message: string }): Failure => ({ ok: false, code: parseError(error.message).code, message: errorSentence(error.message) });
const reasonOk = (r: string) => r.trim().length >= 3;

type Db = Awaited<ReturnType<typeof createClient>>;

/** The merged scoring model of a heat's division, read as the signed-in head judge (row security decides). */
async function modelForHeat(db: Db, heatId: string): Promise<ScoringModel | null> {
  const { data: heat } = await db.from("heats").select("division_id").eq("id", heatId).maybeSingle();
  if (!heat) return null;
  const { data: d } = await db.from("divisions").select("scoring_model_id, scoring_overrides").eq("id", heat.division_id).maybeSingle();
  if (!d?.scoring_model_id) return null;
  const { data: m } = await db.from("scoring_models").select("json").eq("id", d.scoring_model_id).maybeSingle();
  if (!m) return null;
  try {
    return parseScoringModel(mergeOverrides(m.json as never, d.scoring_overrides, SCORING_NULLABLE));
  } catch {
    return null;
  }
}

/** Change one judge's score of one attempt, enter one a judge never gave, or mark the judge absent for it (missed, reason "Absent"). */
export async function headSetScore(input: { attemptId: string; seatId: string; score?: number | null; criteria?: Record<string, number> | null; missed?: boolean; reason: string }): Promise<HeadResult> {
  if (!uuid.safeParse(input.attemptId).success || !uuid.safeParse(input.seatId).success) return fail("ATTEMPT_NOT_FOUND");
  if (!reasonOk(input.reason)) return fail("REASON_REQUIRED");
  const db = await createClient();
  const { data: a } = await db.from("trick_attempts").select("heat_id").eq("id", input.attemptId).maybeSingle();
  if (!a) return fail("ATTEMPT_NOT_FOUND");
  const model = await modelForHeat(db, a.heat_id);
  if (!model) return fail("NOT_ALLOWED");
  const problem = checkTrickScore(model, { score: input.score, criteria: input.criteria, missed: input.missed });
  if (problem) return fail(problem);
  const { error } = await db.rpc("head_set_trick_score", {
    p_attempt: input.attemptId,
    p_seat: input.seatId,
    p_score: (input.missed ? null : (input.score ?? null)) as never,
    p_criteria: (input.criteria ?? {}) as unknown as Json,
    p_missed: Boolean(input.missed),
    p_reason: input.reason.trim(),
  });
  return error ? from(error) : { ok: true };
}

/** Paper sheets, typed in: one judge's Impression / Variety score for one rider. */
export async function headSetImpression(input: { heatId: string; entryId: string; seatId: string; value: number; reason: string }): Promise<HeadResult> {
  if (![input.heatId, input.entryId, input.seatId].every((x) => uuid.safeParse(x).success)) return fail("HEAT_NOT_FOUND");
  if (!reasonOk(input.reason)) return fail("REASON_REQUIRED");
  const db = await createClient();
  const model = await modelForHeat(db, input.heatId);
  if (!model) return fail("NOT_ALLOWED");
  const problem = checkImpression(model, input.value);
  if (problem) return fail(problem);
  const { error } = await db.rpc("head_set_impression", { p_heat: input.heatId, p_entry: input.entryId, p_seat: input.seatId, p_value: input.value, p_reason: input.reason.trim() });
  return error ? from(error) : { ok: true };
}

/** Edit an attempt: rider, trick, direction, landed or crashed. Fields left out stay as they are. */
export async function editAttempt(input: { attemptId: string; reason: string; entryId?: string; trickName?: string; category?: string | null; status?: "landed" | "crashed"; direction?: "left" | "right" }): Promise<HeadResult> {
  if (!uuid.safeParse(input.attemptId).success) return fail("ATTEMPT_NOT_FOUND");
  if (!reasonOk(input.reason)) return fail("REASON_REQUIRED");
  const db = await createClient();
  const { error } = await db.rpc("edit_attempt", {
    p_attempt: input.attemptId,
    p_reason: input.reason.trim(),
    ...(input.entryId ? { p_entry: input.entryId } : {}),
    ...(input.trickName ? { p_trick_name: input.trickName.trim() } : {}),
    ...(input.category ? { p_category: input.category } : {}),
    ...(input.status ? { p_status: input.status } : {}),
    ...(input.direction ? { p_direction: input.direction } : {}),
  });
  return error ? from(error) : { ok: true };
}

/** Delete one or several attempts, each with the same reason (each is audited on its own). */
export async function deleteAttempts(ids: string[], reason: string): Promise<HeadResult> {
  if (!ids.length || !ids.every((x) => uuid.safeParse(x).success)) return fail("ATTEMPT_NOT_FOUND");
  if (!reasonOk(reason)) return fail("REASON_REQUIRED");
  const db = await createClient();
  for (const id of ids) {
    const { error } = await db.rpc("delete_attempt", { p_attempt: id, p_reason: reason.trim() });
    if (error) return from(error);
  }
  return { ok: true };
}

/**
 * Merge attempts that are one. `keep` is the first-logged unless the head judge chose otherwise; `choices` says, per judge seat, whose score is kept where both scored.
 * Several ticked attempts merge into the kept one in turn.
 */
export async function mergeAttempts(input: { keep: string; drops: string[]; choices?: Record<string, "keep" | "drop">; reason: string }): Promise<HeadResult> {
  if (![input.keep, ...input.drops].every((x) => uuid.safeParse(x).success) || input.drops.length === 0) return fail("BAD_MERGE");
  if (!reasonOk(input.reason)) return fail("REASON_REQUIRED");
  const db = await createClient();
  for (const drop of input.drops) {
    const { error } = await db.rpc("merge_attempts", { p_keep: input.keep, p_drop: drop, p_choices: (input.choices ?? {}) as unknown as Json, p_reason: input.reason.trim() });
    if (error) return from(error);
  }
  return { ok: true };
}

/** The first-logged attempt of a set, for the default of the Merge dialog (the server side of decision 10). */
export async function defaultMerge(ids: string[]): Promise<{ keep: string; drop: string[] } | null> {
  if (ids.length < 2 || !ids.every((x) => uuid.safeParse(x).success)) return null;
  const db = await createClient();
  const { data } = await db.from("trick_attempts").select("id, created_at, seq").in("id", ids);
  return data && data.length === ids.length ? defaultKeep(data) : null;
}

export async function setRiderStatus(input: { heatId: string; entryId: string; modifier: "DNS" | "DNF" | "DSQ" | null; reason: string }): Promise<HeadResult> {
  if (!uuid.safeParse(input.heatId).success || !uuid.safeParse(input.entryId).success) return fail("RIDER_NOT_IN_HEAT");
  if (!reasonOk(input.reason)) return fail("REASON_REQUIRED");
  const db = await createClient();
  const { error } = await db.rpc("set_rider_status", { p_heat: input.heatId, p_entry: input.entryId, p_modifier: input.modifier as never, p_reason: input.reason.trim() });
  return error ? from(error) : { ok: true };
}

export async function addInterference(input: { heatId: string; entryId: string; reason: string }): Promise<HeadResult> {
  if (!uuid.safeParse(input.heatId).success || !uuid.safeParse(input.entryId).success) return fail("RIDER_NOT_IN_HEAT");
  if (!reasonOk(input.reason)) return fail("REASON_REQUIRED");
  const db = await createClient();
  const { error } = await db.rpc("add_penalty", { p_heat: input.heatId, p_entry: input.entryId, p_type: "INT", p_reason: input.reason.trim() });
  return error ? from(error) : { ok: true };
}

export async function removePenalty(penaltyId: string, reason: string): Promise<HeadResult> {
  if (!uuid.safeParse(penaltyId).success) return fail("PENALTY_NOT_FOUND");
  if (!reasonOk(reason)) return fail("REASON_REQUIRED");
  const db = await createClient();
  const { error } = await db.rpc("remove_penalty", { p_penalty: penaltyId, p_reason: reason.trim() });
  return error ? from(error) : { ok: true };
}

export async function flagOutRiders(heatId: string, entryIds: string[], reason: string): Promise<HeadResult> {
  if (!uuid.safeParse(heatId).success || !entryIds.every((x) => uuid.safeParse(x).success)) return fail("RIDER_NOT_IN_HEAT");
  if (!reasonOk(reason)) return fail("REASON_REQUIRED");
  const db = await createClient();
  const { error } = await db.rpc("flag_out", { p_heat: heatId, p_entries: entryIds, p_reason: reason.trim() });
  return error ? from(error) : { ok: true };
}

/** The head judge's order for riders who are tied, best first. */
export async function decideTie(heatId: string, riderIds: string[], reason: string): Promise<HeadResult> {
  if (!uuid.safeParse(heatId).success || riderIds.length < 2 || !riderIds.every((x) => uuid.safeParse(x).success)) return fail("BAD_TIE");
  if (!reasonOk(reason)) return fail("REASON_REQUIRED");
  const db = await createClient();
  const { error } = await db.rpc("decide_tie", { p_heat: heatId, p_rider_ids: riderIds, p_reason: reason.trim() });
  return error ? from(error) : { ok: true };
}

export async function resolveFlag(flagId: string, resolution: string): Promise<HeadResult> {
  if (!uuid.safeParse(flagId).success) return fail("FLAG_NOT_FOUND");
  const db = await createClient();
  const { error } = await db.rpc("resolve_flag", { p_flag: flagId, p_resolution: resolution.trim() || (undefined as never) });
  return error ? from(error) : { ok: true };
}

export async function reopenHeat(heatId: string, reason: string): Promise<HeadResult> {
  if (!uuid.safeParse(heatId).success) return fail("HEAT_NOT_FOUND");
  if (!reasonOk(reason)) return fail("REASON_REQUIRED");
  const db = await createClient();
  const { error } = await db.rpc("reopen_heat", { p_heat: heatId, p_reason: reason.trim() });
  return error ? from(error) : { ok: true };
}

/** Add an attempt as the head judge (or an organiser): past the rider's cap only with a reason, and only the head judge, or an organiser when the event has no head judge. */
export async function addAttemptByHead(input: { heatId: string; entryId: string; trickName: string; direction?: "left" | "right"; status: "landed" | "crashed"; reason?: string }): Promise<HeadResult> {
  if (!uuid.safeParse(input.heatId).success || !uuid.safeParse(input.entryId).success) return fail("RIDER_NOT_IN_HEAT");
  if (!input.trickName.trim()) return fail("BAD_STATUS");
  const db = await createClient();
  const { error } = await db.rpc("add_attempt", {
    p_heat: input.heatId,
    p_entry: input.entryId,
    p_client_key: crypto.randomUUID(),
    p_status: input.status,
    p_trick_name: input.trickName.trim(),
    p_input_method: "text",
    ...(input.direction ? { p_direction: input.direction } : {}),
    ...(input.reason?.trim() ? { p_override_reason: input.reason.trim() } : {}),
  });
  return error ? from(error) : { ok: true };
}

/** Publish (docs/PLAN-phase-5 step 5). One server action, one database transaction, safe to press twice. */
export async function publishHeat(heatId: string, overrideReason?: string): Promise<PublishResult> {
  if (!uuid.safeParse(heatId).success) return { ok: false, code: "HEAT_NOT_FOUND", message: errorSentence("HEAT_NOT_FOUND") };
  const user = await createClient();
  return publishHeatCore({ user, service: createServiceClient() }, heatId, { overrideReason });
}

/** Release a held result to the public, or hold it back (with a reason). */
export async function setPublishHold(heatId: string, hold: boolean, reason?: string): Promise<HeadResult> {
  if (!uuid.safeParse(heatId).success) return fail("HEAT_NOT_FOUND");
  if (hold && !reasonOk(reason ?? "")) return fail("REASON_REQUIRED");
  const db = await createClient();
  const { error } = await db.rpc("set_publish_hold", { p_heat: heatId, p_hold: hold, ...(reason?.trim() ? { p_reason: reason.trim() } : {}) });
  return error ? from(error) : { ok: true };
}

/**
 * Re-run heat (owner, 1 Oct 2026): cancels the heat and creates "Heat 3 re-run" with the same riders, seats, Lycras and timing; later seats follow it; the draw
 * stays locked. The new run order (the re-run right after the heat that is live now) is worked out here with the pure insertRerunItem and handed to the
 * database, which accepts it only if the plan is as we saw it and exactly one item was added. Riders in `leaveOut` are marked DSQ or DNS and ranked last.
 */
export async function rerunHeat(input: { heatId: string; reason: string; leaveOut: Record<string, "DSQ" | "DNS"> }): Promise<{ ok: true; newHeatId: string } | { ok: false; code: string | null; message: string }> {
  if (!uuid.safeParse(input.heatId).success) return fail("HEAT_NOT_FOUND");
  if (!reasonOk(input.reason)) return fail("REASON_REQUIRED");
  const db = await createClient();
  const { data: heat } = await db.from("heats").select("id, event_id, number, number_suffix, name").eq("id", input.heatId).maybeSingle();
  if (!heat) return fail("HEAT_NOT_FOUND");
  const named = rerunName({ number: heat.number, suffix: heat.number_suffix, name: heat.name });
  const newId = crypto.randomUUID();

  // the run order that holds this heat, and the heat that is live now
  const [{ data: plans }, { data: liveRows }] = await Promise.all([
    db.from("schedule_plans").select("id, event_id, day, name, items, anchors, actual_starts, hold, defaults, active, updated_at").eq("event_id", heat.event_id).eq("active", true),
    db.from("heats").select("id").eq("event_id", heat.event_id).in("status", ["running", "paused"]),
  ]);
  const row = (plans ?? []).find((p) => Array.isArray(p.items) && (p.items as Array<{ heatId?: string }>).some((i) => i.heatId === heat.id));
  let plan: { id: string; items: Json; updatedAt: string } | null = null;
  if (row) {
    const dp = rowToPlan(row as unknown as PlanRow);
    const rawItems = row.items as unknown as RunItem[];
    const liveId = (liveRows ?? []).find((h) => h.id !== heat.id)?.id ?? ((liveRows ?? []).some((h) => h.id === heat.id) ? heat.id : null);
    const next = insertRerunItem({ ...dp.plan, items: rawItems }, heat.id, newId, liveId);
    plan = { id: row.id, items: next.items as unknown as Json, updatedAt: row.updated_at };
  }
  const { error } = await db.rpc("rerun_heat", {
    p_heat: heat.id,
    p_new_heat: newId,
    p_suffix: named.suffix,
    p_name: named.name,
    p_reason: input.reason.trim(),
    p_leave_out: input.leaveOut as unknown as Json,
    p_plan: (plan?.id ?? null) as never,
    p_plan_items: (plan?.items ?? null) as never,
    p_plan_updated_at: (plan?.updatedAt ?? null) as never,
  });
  return error ? from(error) : { ok: true, newHeatId: newId };
}

/** The head judge's per-heat switch for live scores on the public site: on, off, or follow the setting (null). */
export async function setHeatPublicLive(heatId: string, value: boolean | null): Promise<HeadResult> {
  if (!uuid.safeParse(heatId).success) return fail("HEAT_NOT_FOUND");
  const db = await createClient();
  const { error } = await db.rpc("set_heat_public_live", { p_heat: heatId, p_value: value as never });
  return error ? from(error) : { ok: true };
}

/** Practice heat: one made-up attempt on a simulation event (organisers only; the database checks both). */
export async function practiceAdd(input: { heatId: string; entryId: string; trickName: string; direction: "left" | "right"; category: string | null; parts: Json; status: "landed" | "crashed" }): Promise<HeadResult> {
  if (!uuid.safeParse(input.heatId).success || !uuid.safeParse(input.entryId).success) return fail("RIDER_NOT_IN_HEAT");
  const db = await createClient();
  const { error } = await db.rpc("practice_add_attempt", {
    p_heat: input.heatId,
    p_entry: input.entryId,
    p_trick: { name: input.trickName, direction: input.direction, category: input.category, parts: input.parts } as unknown as Json,
    p_status: input.status,
  });
  return error ? from(error) : { ok: true };
}
