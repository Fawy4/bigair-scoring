import type { RunItem, SchedulePlan } from "@/lib/schemas/schedule";
import { computeTimetable } from "./timetable";
import { utcToLocalHHMM } from "./time";
import type { HeatLive, TimetableOptions } from "./types";

const MIN = 60_000;

/**
 * The break after a heat, and the head judge's "next heat" check (Console v2). Pure: "now" is always passed in (the database's clock).
 *
 * Pins hold whole minutes ("14:11"), so anything that moves a start by a number of minutes rounds UP to the next whole minute: it is never shorter than
 * asked and never a full minute longer (owner's decision, 1 Oct 2026). The countdown itself shows seconds because the real start (end of the last heat +
 * break + warm-up) is exact until a pin takes over.
 */

const roundUpToMinute = (ms: number) => Math.ceil(ms / MIN) * MIN;

/** A heat row of the plan that can still be started: it has not started, was not cancelled, and its heat is still there. */
function startable(item: RunItem, byHeat: Map<string, HeatLive>): boolean {
  if (item.kind !== "heat") return false;
  const live = item.heatId ? byHeat.get(item.heatId) : undefined;
  return Boolean(live && !live.startedAt && !live.cancelled);
}

/** The first heat of the run order that has not started and is not cancelled: the heat the head judge is expected to start next. */
export function nextHeatInOrder(plan: SchedulePlan | null, heats: HeatLive[]): { itemId: string; heatId: string } | null {
  if (!plan) return null;
  const byHeat = new Map(heats.map((h) => [h.heatId, h]));
  for (const item of plan.items) if (item.kind === "heat" && item.heatId && startable(item, byHeat)) return { itemId: item.id, heatId: item.heatId };
  return null;
}

/** Starting `heatId` now: is it a different heat from the one the run order expects? (No run order, or nothing waiting in it: no warning.) */
export function startsOutOfOrder(plan: SchedulePlan | null, heats: HeatLive[], heatId: string): { outOfOrder: false } | { outOfOrder: true; nextHeatId: string } {
  const next = nextHeatInOrder(plan, heats);
  return next && next.heatId !== heatId ? { outOfOrder: true, nextHeatId: next.heatId } : { outOfOrder: false };
}

/** The first item (heat or explicit break) of the run order that has not started: the one a pin must hold back to move the next heat. */
function nextItemToStart(plan: SchedulePlan, heats: HeatLive[]): RunItem | undefined {
  const byHeat = new Map(heats.map((h) => [h.heatId, h]));
  return plan.items.find((i) => (i.kind === "heat" ? startable(i, byHeat) : i.kind === "break" && !plan.actualStarts[i.id]));
}

export type BreakNone = { kind: "none"; reason: "no-plan" | "heat-running" | "no-ended-heat" | "nothing-next" | "no-time" };
export type BreakCountdown = {
  kind: "break";
  /** counting: time left; due: the start has passed, nothing starts by itself; paused: held by Pause break. */
  state: "counting" | "due" | "paused";
  heatId: string;
  itemId: string;
  /** When the next heat starts (break and warm-up included). While paused, when it would have started. */
  startUtc: string;
  /** Milliseconds left; frozen while paused; 0 when due. */
  remainingMs: number;
  /** When due: how long past the start it is. */
  lateMs: number;
};

/**
 * "Next: R1 · H3 · starts in 4:30". It exists from the moment a heat has ended until the next heat starts. The start is the timetable's own, worked out
 * WITHOUT the "nothing runs in the past" rule, so a head judge who is late sees "due" and how late, not a countdown that keeps running away from them.
 */
export function breakCountdown(plan: SchedulePlan | null, heats: HeatLive[], opts: Pick<TimetableOptions, "timezone" | "eventDay" | "defaults"> & { now: string }): BreakCountdown | BreakNone {
  if (heats.some((h) => h.startedAt && !h.endedAt && !h.cancelled)) return { kind: "none", reason: "heat-running" };
  const ended = heats.filter((h) => h.startedAt && h.endedAt);
  if (ended.length === 0) return { kind: "none", reason: "no-ended-heat" };
  if (!plan) return { kind: "none", reason: "no-plan" };
  const next = nextHeatInOrder(plan, heats);
  if (!next) return { kind: "none", reason: "nothing-next" };
  const open: SchedulePlan = { ...plan };
  delete open.hold;
  const { timezone, eventDay, defaults } = opts;
  const row = computeTimetable(open, heats, { timezone, eventDay, defaults }).rows.find((r) => r.itemId === next.itemId);
  if (!row?.startUtc) return { kind: "none", reason: "no-time" };
  const start = Date.parse(row.startUtc);
  const base = { kind: "break" as const, heatId: next.heatId, itemId: next.itemId, startUtc: row.startUtc };
  if (plan.hold) {
    const lastEnd = Math.max(...ended.map((h) => Date.parse(h.endedAt!)));
    const frozenAt = Math.max(Date.parse(plan.hold.since), lastEnd);
    return { ...base, state: "paused", remainingMs: Math.max(0, start - frozenAt), lateMs: 0 };
  }
  const left = start - Date.parse(opts.now);
  return left > 0 ? { ...base, state: "counting", remainingMs: left, lateMs: 0 } : { ...base, state: "due", remainingMs: 0, lateMs: -left };
}

/**
 * "+1 min": this break is `minutes` longer and everything after it moves with it. Pins the next item at its start plus the minutes, rounded up to the
 * minute; a head judge who is already late gets the minutes from now. Like Shift, only a pin changes: the plan's hold and anchors are the only things touched.
 */
export function extendBreak(plan: SchedulePlan, heats: HeatLive[], minutes: number, ctx: TimetableOptions & { now: string }): SchedulePlan {
  if (plan.hold) throw new Error("The plan is on hold: resume it instead of adding a minute.");
  const next = nextItemToStart(plan, heats);
  if (!next) throw new Error("Nothing left to shift: every item has started.");
  const { timezone, eventDay, defaults } = ctx;
  const row = computeTimetable(plan, heats, { timezone, eventDay, defaults }).rows.find((r) => r.itemId === next.id);
  if (!row?.startUtc) throw new Error("The next item has no projected start time yet; pin it first.");
  const from = Math.max(Date.parse(row.startUtc), Date.parse(ctx.now));
  return { ...plan, anchors: { ...plan.anchors, [next.id]: utcToLocalHHMM(roundUpToMinute(from + minutes * MIN), timezone) } };
}

/**
 * Resume after "Pause break": the next heat is pinned at now + what was left when the break was paused, rounded up to the minute, and the hold is cleared.
 * A break that was already due when it was paused is simply released: nothing is pinned.
 */
export function resumeBreak(plan: SchedulePlan, heats: HeatLive[], ctx: TimetableOptions & { now: string }): SchedulePlan {
  if (!plan.hold) throw new Error("The plan is not on hold.");
  const info = breakCountdown(plan, heats, ctx);
  const resumed: SchedulePlan = { ...plan };
  delete resumed.hold;
  if (info.kind === "break" && info.remainingMs > 0) {
    const item = plan.items.find((i) => i.id === info.itemId);
    const target = roundUpToMinute(Date.parse(ctx.now) + info.remainingMs);
    if (item) resumed.anchors = { ...plan.anchors, [item.id]: utcToLocalHHMM(target, ctx.timezone) };
  }
  return resumed;
}
