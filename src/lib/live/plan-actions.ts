import { extendBreak, localToUtc, resumeBreak, resumeHold, shift, startHold, toIso, type HeatLive } from "@/lib/engine/schedule";
import type { ScheduleDefaults, SchedulePlan } from "@/lib/schemas/schedule";

/**
 * The head judge's Hold, Resume at and Shift on SERVER time (docs/08 §1G-11). The moment is always passed in (the database's `server_now()`),
 * never read from the device. Each returns the new plan; the server action saves only its hold and pins.
 */
export const holdPlan = (plan: SchedulePlan, serverNowIso: string, reason?: string): SchedulePlan => startHold(plan, serverNowIso, reason);

export const resumePlanAt = (plan: SchedulePlan, heats: HeatLive[], day: string, hhmm: string, timezone: string): SchedulePlan =>
  resumeHold(plan, heats, toIso(localToUtc(day, hhmm, timezone)), { timezone });

export const shiftPlan = (plan: SchedulePlan, heats: HeatLive[], minutes: number, ctx: { timezone: string; eventDay: string; defaults: ScheduleDefaults; serverNowIso: string }): SchedulePlan =>
  shift(plan, heats, minutes, { timezone: ctx.timezone, eventDay: ctx.eventDay, defaults: ctx.defaults, now: ctx.serverNowIso });

/** "+1 min" on the break after a heat: the next heat is pinned one minute later (rounded up to a whole minute), and everything after it moves with it. */
export const extendBreakPlan = (plan: SchedulePlan, heats: HeatLive[], minutes: number, ctx: { timezone: string; eventDay: string; defaults: ScheduleDefaults; serverNowIso: string }): SchedulePlan =>
  extendBreak(plan, heats, minutes, { timezone: ctx.timezone, eventDay: ctx.eventDay, defaults: ctx.defaults, now: ctx.serverNowIso });

/** Resume after "Pause break": the same time left as when it was paused, rounded up to a whole minute. */
export const resumeBreakPlan = (plan: SchedulePlan, heats: HeatLive[], ctx: { timezone: string; eventDay: string; defaults: ScheduleDefaults; serverNowIso: string }): SchedulePlan =>
  resumeBreak(plan, heats, { timezone: ctx.timezone, eventDay: ctx.eventDay, defaults: ctx.defaults, now: ctx.serverNowIso });

/** The part of a plan a head judge's action may change: the hold and the pins, nothing else. */
export function planChange(before: SchedulePlan, after: SchedulePlan): { hold: SchedulePlan["hold"] | null; anchors: SchedulePlan["anchors"] } {
  return { hold: after.hold ?? null, anchors: after.anchors ?? before.anchors };
}
