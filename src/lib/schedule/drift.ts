import { computeTimetable, type HeatLive, type Timetable, type TimetableOptions } from "@/lib/engine/schedule";
import type { SchedulePlan } from "@/lib/schemas/schedule";

/** How far the day has slipped: the next heat that has not started, its time in the plan as written against its time now. Worked out from the timetable engine; nothing is stored. */
export type DriftTone = "green" | "amber" | "red";
export interface Drift {
  state: "on_schedule" | "late" | "early";
  /** Whole minutes, always 0 or more ("6" for 6 minutes late). */
  minutes: number;
  tone: DriftTone;
  /** The run-order item (and its heat) the figure is about. */
  itemId: string;
  heatId?: string;
}

/** Late by up to this many minutes is amber; later is red. Early or on time is green. */
export const AMBER_UP_TO_MIN = 10;

export const driftTone = (signedMinutes: number): DriftTone => (signedMinutes <= 0 ? "green" : signedMinutes <= AMBER_UP_TO_MIN ? "amber" : "red");

/** The plan as it was written: nothing has started, nothing is held, and there is no "now" to push heats later. */
export function plannedTimetable(plan: SchedulePlan, lives: HeatLive[], opts: TimetableOptions): Timetable {
  const stripped = lives.map((l) => ({ ...l, startedAt: null, endedAt: null, pausedMin: 0 }));
  const { now: _now, ...rest } = opts;
  void _now;
  return computeTimetable({ ...plan, actualStarts: {}, hold: undefined }, stripped, rest);
}

/**
 * The drift between two timetables of the same plan: `planned` (as written) and `current` (with the real starts and "now").
 * It looks at the first heat that has not started: late when the current time is later, early when it is earlier. Null when there is no such heat or it has no time (a hold).
 */
export function driftOf(planned: Timetable | null, current: Timetable | null): Drift | null {
  if (!planned || !current) return null;
  const next = current.rows.find((r) => r.kind === "heat" && (r.status === "next" || r.status === "est" || r.status === "pinned"));
  if (!next || !next.startUtc) return null;
  const was = planned.rows.find((r) => r.itemId === next.itemId)?.startUtc;
  if (!was) return null;
  const signed = Math.round((Date.parse(next.startUtc) - Date.parse(was)) / 60_000);
  return { state: signed === 0 ? "on_schedule" : signed > 0 ? "late" : "early", minutes: Math.abs(signed), tone: driftTone(signed), itemId: next.itemId, ...(next.heatId ? { heatId: next.heatId } : {}) };
}

/** Both timetables and their difference in one call, for a screen that has the plan, the heats and the clock. */
export function scheduleDrift(plan: SchedulePlan, lives: HeatLive[], opts: TimetableOptions): Drift | null {
  return driftOf(plannedTimetable(plan, lives, opts), computeTimetable(plan, lives, opts));
}
