import type { ScheduleDefaults } from "@/lib/schemas/schedule";

/**
 * What the timetable needs to know about a heat. In the app this is built from the heats table:
 * `startedAt` / `endedAt` are the server timestamps (`heats.started_at` / `ended_at`), Decision 9.
 */
export interface HeatLive {
  heatId: string;
  startedAt?: string | null;
  endedAt?: string | null;
  /** Minutes the running heat was paused (wind or equipment stop); they extend its projected end. */
  pausedMin?: number;
  division?: string;
  round?: string;
  heat?: string;
  /** Last heat of its round: uses the round's "break after round". */
  roundLast?: boolean;
  /** Round defaults used when the run item does not override them. */
  durationMin?: number;
  /** Warm-up before the heat in minutes (default 0). The heat's competition timer is only `durationMin`. */
  warmUpMin?: number;
  breakAfterHeatMin?: number;
  breakAfterRoundMin?: number;
  /** The heat was cancelled (for example replaced by a re-run). One that ran keeps its real times; one that never started takes no time. */
  cancelled?: boolean;
}

export type RowStatus = "done" | "live" | "next" | "est" | "held" | "pinned" | "cancelled";

export interface TimetableRow {
  itemId: string;
  kind: "heat" | "break" | "note";
  heatId?: string;
  label: string;
  division?: string;
  round?: string;
  heat?: string;
  /** ISO instants (UTC) and local "HH:MM" in the event time zone. Null while the plan is on hold or has no anchor. */
  startUtc: string | null;
  endUtc: string | null;
  start: string | null;
  end: string | null;
  durationMin: number;
  /** Warm-up before a heat: its own segment of the row ("warm-up 10:00 · start 10:05 · end 10:15"). 0 for breaks and notes. */
  warmUpMin: number;
  warmUpStartUtc: string | null;
  warmUpStart: string | null;
  /** Minutes of break after this row; null on the last row of the day ("—"). */
  breakAfterMin: number | null;
  status: RowStatus;
  /** The item has a pin ("not before") in this plan. */
  pinned: boolean;
  /** "Be at the launch" time: start minus readyCallMin (heats only). */
  readyCallUtc: string | null;
  readyCall: string | null;
  /** Plain-language explanation of why the row starts when it does. */
  reason: string;
  warnings: string[];
  /** What is wrong with the row itself (as opposed to timing remarks): the heat has no length, or its heat is gone from the draw. Null when the row is sound. */
  issue: RowIssue | null;
}

export type RowIssue = "no-length" | "no-heat";

export interface TimetableOptions {
  /** "Now" is always a parameter: the engine never reads the clock. ISO instant. */
  now?: string;
  timezone: string;
  eventDay: string;
  defaults: ScheduleDefaults;
}

export interface Timetable {
  rows: TimetableRow[];
  /** End of the last heat or break; null while any row has no time (hold, missing anchor). */
  finishUtc: string | null;
  finish: string | null;
  /** Heats that have not finished yet (running heats count): "heats left" in the header. */
  heatsLeft: number;
  warnings: string[];
}
