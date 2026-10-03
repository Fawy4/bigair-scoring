"use server";

import { z } from "zod";
import { duplicatePlan, RunOrderError } from "@/lib/engine/schedule";
import { copyPlanToDay } from "@/lib/schedule/day-plans";
import { planOfRow, planToRow, type PlanRow } from "@/lib/schedule/plans";
import { ScheduleDefaultsSchema, SchedulePlanSchema, type SchedulePlan } from "@/lib/schemas/schedule";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { copy } from "@/lib/ui-copy";

const T = copy.runOrder.errors;

export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const Uuid = z.string().uuid();
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Name = z.string().trim().min(2, T.nameRequired).max(60, T.nameRequired);

const COLUMNS = "id, event_id, day, name, items, anchors, actual_starts, hold, defaults, active, hand_pins";

function dbMessage(message: string): string {
  if (/NOT_ALLOWED|row-level|permission denied/i.test(message)) return T.notAllowed;
  if (/schedule_plans_one_active|duplicate key/i.test(message)) return T.twoActive;
  return T.failed;
}

/** Every heat a plan names must be a heat of this event (a plan can never point into another organisation's event). */
async function checkHeats(supabase: Awaited<ReturnType<typeof createClient>>, eventId: string, plan: SchedulePlan): Promise<string | null> {
  const ids = [...new Set(plan.items.flatMap((i) => (i.kind === "heat" ? [i.heatId!] : [])))];
  if (ids.length === 0) return null;
  const { data } = await supabase.from("heats").select("id").eq("event_id", eventId).in("id", ids);
  return (data ?? []).length === ids.length ? null : T.unknownHeat;
}

/** A new, empty plan for a day. The first plan of a day is active at once (so the day always has one). */
export async function createPlan(eventId: string, day: string, name: string): Promise<Result<{ row: PlanRow }>> {
  if (!Uuid.safeParse(eventId).success || !Day.safeParse(day).success) return fail(T.failed);
  const n = Name.safeParse(name);
  if (!n.success) return fail(n.error.issues[0].message);
  const supabase = await createClient();
  const { data: existing } = await supabase.from("schedule_plans").select("id, name, active").eq("event_id", eventId).eq("day", day);
  if ((existing ?? []).some((p) => p.name.trim().toLowerCase() === n.data.toLowerCase())) return fail(T.nameTaken);
  const defaults = ScheduleDefaultsSchema.parse({});
  const { data, error } = await supabase
    .from("schedule_plans")
    .insert({ event_id: eventId, day, name: n.data, active: (existing ?? []).length === 0, items: [], anchors: {}, actual_starts: {}, defaults: defaults as unknown as Json })
    .select(COLUMNS)
    .single();
  if (error || !data) return fail(dbMessage(error?.message ?? ""));
  return { ok: true, row: data as PlanRow };
}

/** "Duplicate plan": the same run order under a new name (Plan B "Bad wind"). The copy is not active. */
export async function duplicatePlanAction(planId: string, name: string): Promise<Result<{ row: PlanRow }>> {
  if (!Uuid.safeParse(planId).success) return fail(T.failed);
  const n = Name.safeParse(name);
  if (!n.success) return fail(n.error.issues[0].message);
  const supabase = await createClient();
  const { data: src } = await supabase.from("schedule_plans").select(COLUMNS).eq("id", planId).maybeSingle();
  if (!src) return fail(T.notAllowed);
  const { data: siblings } = await supabase.from("schedule_plans").select(COLUMNS).eq("event_id", src.event_id).eq("day", src.day);
  try {
    const plans = (siblings ?? []).map((r) => planOfRow(r as PlanRow));
    const copied = duplicatePlan(plans, planId, n.data).at(-1)!;
    const { data, error } = await supabase
      .from("schedule_plans")
      .insert({ event_id: src.event_id, day: src.day, name: copied.name, active: false, items: copied.items as unknown as Json, anchors: copied.anchors as unknown as Json, actual_starts: {}, defaults: src.defaults })
      .select(COLUMNS)
      .single();
    if (error || !data) return fail(dbMessage(error?.message ?? ""));
    return { ok: true, row: data as PlanRow };
  } catch (e) {
    return fail(e instanceof RunOrderError ? e.message : T.failed);
  }
}

/**
 * "Copy ‹other day›'s plan to ‹day›" (Polish 2, item 14): a new run order for `day` with the heats, breaks and notes of `planId` and the pins set by hand there;
 * not its actual times, the console's pins or a hold. Active at once when it is the day's first plan (as Create does).
 */
export async function copyPlanToDayAction(planId: string, day: string, name: string): Promise<Result<{ row: PlanRow }>> {
  if (!Uuid.safeParse(planId).success || !Day.safeParse(day).success) return fail(T.failed);
  const n = Name.safeParse(name);
  if (!n.success) return fail(n.error.issues[0].message);
  const supabase = await createClient();
  const { data: src } = await supabase.from("schedule_plans").select(COLUMNS).eq("id", planId).maybeSingle();
  if (!src) return fail(T.notAllowed);
  if (src.day === day) return fail(T.failed);
  const { data: existing } = await supabase.from("schedule_plans").select("id, name").eq("event_id", src.event_id).eq("day", day);
  if ((existing ?? []).some((p) => p.name.trim().toLowerCase() === n.data.toLowerCase())) return fail(T.nameTaken);
  const copied = copyPlanToDay(src as PlanRow);
  const { data, error } = await supabase
    .from("schedule_plans")
    .insert({ event_id: src.event_id, day, name: n.data, active: (existing ?? []).length === 0, items: copied.items as Json, anchors: copied.anchors as unknown as Json, actual_starts: {}, defaults: src.defaults })
    .select(COLUMNS)
    .single();
  if (error || !data) return fail(dbMessage(error?.message ?? ""));
  return { ok: true, row: data as PlanRow };
}

const SaveInput = z.object({
  name: z.string().optional(),
  items: z.unknown(),
  anchors: z.unknown(),
  actualStarts: z.unknown().optional(),
  hold: z.unknown().optional(),
  defaults: z.unknown().optional(),
});

/** Saves the run order of a plan (rows, pins, hold, defaults). The plan is checked with the same schema the timetable uses. */
export async function savePlan(planId: string, input: z.input<typeof SaveInput>): Promise<Result> {
  if (!Uuid.safeParse(planId).success) return fail(T.failed);
  const parsedInput = SaveInput.safeParse(input);
  if (!parsedInput.success) return fail(T.failed);
  const supabase = await createClient();
  const { data: row } = await supabase.from("schedule_plans").select(COLUMNS).eq("id", planId).maybeSingle();
  if (!row) return fail(T.notAllowed);
  const plan = SchedulePlanSchema.safeParse({
    id: row.id,
    name: parsedInput.data.name ?? row.name,
    active: row.active,
    items: parsedInput.data.items,
    anchors: parsedInput.data.anchors ?? {},
    actualStarts: parsedInput.data.actualStarts ?? row.actual_starts ?? {},
    ...(parsedInput.data.hold ? { hold: parsedInput.data.hold } : {}),
  });
  if (!plan.success) return fail(`${T.notValid} ${plan.error.issues[0]?.message ?? ""}`.trim());
  const bad = await checkHeats(supabase, row.event_id, plan.data);
  if (bad) return fail(bad);
  const defaults = parsedInput.data.defaults === undefined ? row.defaults : (ScheduleDefaultsSchema.parse(parsedInput.data.defaults) as unknown as Json);
  const values = planToRow(plan.data);
  const { error } = await supabase
    .from("schedule_plans")
    .update({ name: values.name, items: values.items as Json, anchors: values.anchors as Json, actual_starts: values.actual_starts as Json, hold: values.hold as Json, defaults })
    .eq("id", planId);
  return error ? fail(dbMessage(error.message)) : { ok: true };
}

/** Activate: exactly one plan of the day, switched in one step; heats that have started or finished stay where they ran. */
export async function activatePlan(planId: string): Promise<Result> {
  if (!Uuid.safeParse(planId).success) return fail(T.failed);
  const supabase = await createClient();
  const { error } = await supabase.rpc("activate_schedule_plan", { p_plan: planId });
  return error ? fail(dbMessage(error.message)) : { ok: true };
}

export async function deletePlanAction(planId: string): Promise<Result> {
  if (!Uuid.safeParse(planId).success) return fail(T.failed);
  const supabase = await createClient();
  const { data: row } = await supabase.from("schedule_plans").select("id, active").eq("id", planId).maybeSingle();
  if (!row) return fail(T.notAllowed);
  if (row.active) return fail(T.deleteActive);
  const { error } = await supabase.from("schedule_plans").delete().eq("id", planId);
  return error ? fail(dbMessage(error.message)) : { ok: true };
}
