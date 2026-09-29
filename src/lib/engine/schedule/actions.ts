import type { HeatRef, ScheduleDay, SchedulePlan } from "@/lib/schemas/schedule";
import { computeTimetable } from "./timetable";
import { utcToLocalHHMM } from "./time";
import type { HeatLive, TimetableOptions } from "./types";

/** The first item that has not started (heat by its server timestamp, break/note by the plan). */
function nextUnstarted(plan: SchedulePlan, heats: HeatLive[]) {
  const started = new Set(heats.filter((h) => h.startedAt).map((h) => h.heatId));
  return plan.items.find((i) => (i.kind === "heat" ? !started.has(i.heatId!) : i.kind === "break" && !plan.actualStarts[i.id]));
}

/** Wind hold: from now on every un-started row is "held". */
export function startHold(plan: SchedulePlan, at: string, reason?: string): SchedulePlan {
  return { ...plan, hold: { since: at, ...(reason ? { reason } : {}) } };
}

/** Resume: the head judge picks the restart time, which pins the next un-started item; the cascade continues from there. */
export function resumeHold(plan: SchedulePlan, heats: HeatLive[], restartAt: string, ctx: { timezone: string }): SchedulePlan {
  if (!plan.hold) throw new Error("The plan is not on hold.");
  const next = nextUnstarted(plan, heats);
  const resumed: SchedulePlan = { ...plan, ...(next ? { anchors: { ...plan.anchors, [next.id]: utcToLocalHHMM(restartAt, ctx.timezone) } } : {}) };
  delete resumed.hold;
  return resumed;
}

/** "Shift everything by +N min": pins the next un-started item at its projected start + N. */
export function shift(plan: SchedulePlan, heats: HeatLive[], minutes: number, ctx: TimetableOptions): SchedulePlan {
  if (plan.hold) throw new Error("The plan is on hold: resume it (with a restart time) instead of shifting.");
  const next = nextUnstarted(plan, heats);
  if (!next) throw new Error("Nothing left to shift: every item has started.");
  const row = computeTimetable(plan, heats, ctx).rows.find((r) => r.itemId === next.id);
  if (!row?.startUtc) throw new Error("The next item has no projected start time yet; pin it first.");
  return { ...plan, anchors: { ...plan.anchors, [next.id]: utcToLocalHHMM(Date.parse(row.startUtc) + minutes * 60_000, ctx.timezone) } };
}

/** Exactly one plan is active per event day. Pins stay with their own plan (Decision 9). */
export function activatePlan(day: ScheduleDay, planId: string): ScheduleDay {
  if (!day.plans.some((p) => p.id === planId)) throw new Error(`No plan "${planId}" on this day.`);
  return { ...day, plans: day.plans.map((p) => ({ ...p, active: p.id === planId })) };
}

export type HeatLookup = (ref: HeatRef) => string | undefined;
