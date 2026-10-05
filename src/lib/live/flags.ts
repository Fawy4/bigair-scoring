/**
 * The flags: four states derived from the heat's time stamps and the server's clock, nothing else (no device clock, no stored "current flag").
 * A console that reloads, or a judge who opens the page late, gets the same answer at the same moment.
 *
 *   Before start  the pre-start countdown is running (the heat is armed, not yet started)
 *   Running       the heat clock is running
 *   Last minute   the last part of the heat
 *   Stopped       no heat is running: finished, paused, wind hold, between heats, before the first heat
 */
import { DEFAULT_FLAGS, type FlagKind, type FlagSettings } from "@/lib/schemas/flags";
import { copy } from "@/lib/ui-copy";
import { formatClock as formatClockMs, remainingMs, type HeatTiming } from "./timer";

export type StoppedWhy = "finished" | "paused" | "hold" | "between" | "before_day";

/** The clock's input, plus the two start-sequence columns of the heats row (`armed_at`, `prestart_sec`). */
export interface FlagHeat extends HeatTiming {
  armedAt: string | number | null;
  prestartSec: number | null;
  /** The pre-start is frozen (Pause on the console or the simulator): the countdown stands still, and Resume carries on from the same remaining time. */
  armedPausedAt?: string | number | null;
  /** The simulator's speed this heat runs at (1 on a real event): the last-minute length is divided by it, like the heat clock and the pre-start. */
  timeScale?: number;
}

export interface FlagState {
  kind: FlagKind;
  /** Only for the red flag: which of the reasons. */
  why: StoppedWhy | null;
  /** The word on the strip ("Running", "Finished", "Paused", "Hold"). */
  label: string;
  colour: string;
  /** Pre-start remaining, then heat remaining; paused shows the time left, finished and the rest show none. */
  countdownMs: number | null;
  /** Before start only: the moment the heat starts by itself. */
  startsAtMs: number | null;
  /** Before start only: the length of this pre-start, in seconds (for the cue "one minute to the start"). */
  prestartSec: number | null;
  /** The red flag is a frozen pre-start (the heat has not started; the countdown shows what is left of the yellow). */
  inPrestart: boolean;
}

const ms = (t: string | number | null): number | null => (t === null ? null : typeof t === "number" ? t : Date.parse(t));

/** The moment an armed heat starts by itself, or null when it is not armed. */
export function armedStartMs(heat: Pick<FlagHeat, "status" | "armedAt" | "prestartSec">): number | null {
  if (heat.status !== "scheduled" || heat.armedAt === null || heat.armedAt === undefined) return null;
  const at = ms(heat.armedAt);
  return at === null ? null : at + (heat.prestartSec ?? 0) * 1000;
}

/** An armed heat whose pre-start is over is running, and its start time is exactly the armed time plus the pre-start. Every other heat is returned unchanged. */
export function overlayArmed<T extends FlagHeat>(heat: T, nowMs: number): T {
  const start = armedStartMs(heat);
  if (start === null || heat.armedPausedAt || nowMs < start) return heat;
  return { ...heat, status: "running", startedAt: new Date(start).toISOString() };
}

/** The same overlay for a heats row as the live screens read it (snake case). */
export function overlayArmedRow<T extends { status: string; started_at: string | null; armed_at?: string | null; prestart_sec?: number | null; armed_paused_at?: string | null }>(row: T, nowMs: number): T {
  if (row.status !== "scheduled" || !row.armed_at || row.armed_paused_at) return row;
  const start = Date.parse(row.armed_at) + (row.prestart_sec ?? 0) * 1000;
  return nowMs < start ? row : { ...row, status: "running", started_at: new Date(start).toISOString() };
}

export interface FlagInput {
  settings: FlagSettings;
  /** The heat in front of the screen (null: none). */
  heat: FlagHeat | null;
  /** Server time. */
  nowMs: number;
  /** The timetable is on a wind hold. */
  onHold?: boolean;
  /** A heat has started today (tells "Between heats" from "Before the first heat"). */
  anyHeatStarted?: boolean;
}

function stoppedWord(why: StoppedWhy, fallback: string): string {
  return why === "finished" ? copy.flags.why.finished : why === "paused" ? copy.flags.why.paused : why === "hold" ? copy.flags.why.hold : fallback;
}

/** The state of the flags, or null when the event has flags switched off (every screen then looks as it did before flags). */
export function flagState(i: FlagInput): FlagState | null {
  const { settings, nowMs } = i;
  if (!settings.enabled) return null;
  const look = settings.states;
  const make = (kind: FlagKind, why: StoppedWhy | null, countdownMs: number | null, extra: Partial<Pick<FlagState, "startsAtMs" | "prestartSec" | "inPrestart">> = {}): FlagState => ({
    kind,
    why,
    label: kind === "stopped" ? stoppedWord(why ?? "between", look.stopped.label) : look[kind].label,
    colour: look[kind].colour,
    countdownMs,
    startsAtMs: extra.startsAtMs ?? null,
    prestartSec: extra.prestartSec ?? null,
    inPrestart: extra.inPrestart ?? false,
  });
  const idle: StoppedWhy = i.onHold ? "hold" : i.anyHeatStarted ? "between" : "before_day";
  let heat = i.heat;
  if (!heat) return make("stopped", idle, null);

  const start = armedStartMs(heat);
  if (start !== null && heat.armedPausedAt) {
    // a frozen pre-start: red "Paused", the countdown stands where it was frozen
    const frozen = typeof heat.armedPausedAt === "number" ? heat.armedPausedAt : Date.parse(heat.armedPausedAt);
    return make("stopped", "paused", Math.max(0, start - frozen), { prestartSec: heat.prestartSec, inPrestart: true });
  }
  if (start !== null && nowMs < start) return make("before_start", null, start - nowMs, { startsAtMs: start, prestartSec: heat.prestartSec });
  heat = overlayArmed(heat, nowMs);

  switch (heat.status) {
    case "scheduled":
      return make("stopped", idle, null);
    case "cancelled":
      return make("stopped", i.onHold ? "hold" : "between", null);
    case "ended":
    case "under_review":
    case "published":
      return make("stopped", i.onHold ? "hold" : "finished", null);
    case "paused":
      return make("stopped", "paused", remainingMs(heat, nowMs));
    default: {
      const left = remainingMs(heat, nowMs);
      if (left <= 0) return make("stopped", i.onHold ? "hold" : "finished", null);
      // on a simulation the last minute is as short as the heat clock and the pre-start (a minute at x10 is six seconds)
      const lastMinuteMs = (settings.lastMinuteSec * 1000) / Math.max(1, heat.timeScale ?? 1);
      return make(left <= lastMinuteMs ? "last_minute" : "running", null, left);
    }
  }
}

/**
 * The horns for a change from one reading to the next: one at green, one at the last minute, two at red (finished), one at resume. Nothing after a reload (no
 * previous reading), nothing for a pause or an abort, and a long freeze that jumps over several moments sounds only the last one.
 */
export function hornsFor(prev: FlagState | null, next: FlagState | null): 0 | 1 | 2 {
  if (!prev || !next || prev.kind === next.kind) return 0;
  if (next.kind === "before_start") return 0; // the yellow carries on after a freeze: no horn
  if (prev.kind === "last_minute" && next.kind === "running") return 0; // "+1 min" in the last minute: back to green without a horn; the last minute's horn sounds again when it begins
  if (next.kind === "stopped") return next.why === "finished" && (prev.kind === "running" || prev.kind === "last_minute") ? 2 : prev.kind === "before_start" && next.why === "finished" ? 2 : 0;
  // on to green or the last minute: from the yellow, from a pause (resume), or from a last minute that began at once
  return 1;
}

/** "one minute", "2 minutes", "30 seconds" for the cue. */
export function lengthWords(sec: number): string {
  const L = copy.flags.length;
  if (sec === 60) return L.oneMinute;
  if (sec % 60 === 0) return L.minutes(sec / 60);
  if (sec < 60) return L.seconds(sec);
  return L.minuteSeconds(Math.floor(sec / 60), sec % 60);
}

/** The nearest everyday colour name for a hex colour ("Yellow", "Green", "Red"). */
export function colourName(hex: string): string {
  const n = copy.flags.colourNames;
  const v = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!v) return n.grey;
  const r = parseInt(v[1].slice(0, 2), 16) / 255;
  const g = parseInt(v[1].slice(2, 4), 16) / 255;
  const b = parseInt(v[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (max < 0.18) return n.black;
  if (d < 0.08) return max > 0.85 ? n.white : n.grey;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 15 || h >= 345) return max > 0.9 && min > 0.45 ? n.pink : n.red;
  if (h < 40) return max < 0.65 ? n.brown : n.orange;
  if (h < 70) return n.yellow;
  if (h < 170) return n.green;
  if (h < 260) return n.blue;
  if (h < 300) return n.purple;
  return n.pink;
}

/** The text cue the announcer reads for a change ("Yellow — one minute to the start of Heat 5"), or null when nothing changed or there is nothing to say. */
export function cueFor(prev: FlagState | null, next: FlagState | null, heatName: string): string | null {
  if (!prev || !next || prev.kind === next.kind) return null;
  const C = copy.flags.cue;
  const colour = colourName(next.colour);
  switch (next.kind) {
    case "before_start":
      return prev.kind === "stopped" && prev.inPrestart ? C.prestartResumed(colour, heatName) : C.beforeStart(colour, lengthWords(next.prestartSec ?? 60), heatName);
    case "running":
      return prev.kind === "stopped" ? C.resumed(colour, heatName) : C.running(colour, heatName);
    case "last_minute":
      return prev.kind === "stopped" ? C.resumed(colour, heatName) : C.lastMinute(colour, heatName);
    case "stopped":
      if (prev.kind === "before_start") return next.inPrestart ? C.prestartPaused(colour, heatName) : C.aborted(colour, heatName);
      return next.why === "finished" ? C.finished(colour, heatName) : next.why === "paused" ? C.paused(colour, heatName) : next.why === "hold" ? C.hold(colour) : null;
  }
}

/** Black on a light flag (yellow), white on a dark one (green, red). */
export function textOn(hex: string): "#000000" | "#FFFFFF" {
  const v = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!v) return "#FFFFFF";
  const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const lum = 0.2126 * lin(parseInt(v[1].slice(0, 2), 16)) + 0.7152 * lin(parseInt(v[1].slice(2, 4), 16)) + 0.0722 * lin(parseInt(v[1].slice(4, 6), 16));
  return lum > 0.4 ? "#000000" : "#FFFFFF";
}

export { DEFAULT_FLAGS };

/** The columns of a heats row the flags need (snake case, as the live screens read them). */
export interface FlagRowLike {
  id: string;
  status: string;
  duration_sec: number;
  started_at: string | null;
  paused_at: string | null;
  paused_total_sec: number;
  armed_at?: string | null;
  prestart_sec?: number | null;
  armed_paused_at?: string | null;
  time_scale?: number;
}

export function flagHeatOf(row: FlagRowLike): FlagHeat {
  return { status: row.status, durationSec: row.duration_sec, startedAt: row.started_at, pausedAt: row.paused_at, pausedTotalSec: row.paused_total_sec, armedAt: row.armed_at ?? null, prestartSec: row.prestart_sec ?? null, armedPausedAt: row.armed_paused_at ?? null, timeScale: row.time_scale ?? 1 };
}

/** True while the yellow is up for this heat: armed, the pre-start not over (a frozen one counts). */
export function isArmedNow(row: FlagRowLike, nowMs: number): boolean {
  const start = armedStartMs({ status: row.status, armedAt: row.armed_at ?? null, prestartSec: row.prestart_sec ?? null });
  return start !== null && (Boolean(row.armed_paused_at) || nowMs < start);
}

/**
 * The heat the flag strip is about: the heat in its pre-start if there is one (the yellow always wins), else the heat the screen is already on.
 * Heats are the screen's rows; `current` is the one it picked by its own rule (the running heat, or for a judge the one waiting for impressions).
 */
export function pickFlagHeat<T extends FlagRowLike>(heats: T[], current: T | null, nowMs: number): T | null {
  return heats.find((h) => isArmedNow(h, nowMs)) ?? current;
}

/** Has any heat started (so "Between heats" and not "Before the first heat")? */
export const anyHeatStarted = (heats: Array<Pick<FlagRowLike, "started_at" | "armed_at" | "status" | "prestart_sec">>, nowMs: number): boolean =>
  heats.some((h) => h.started_at !== null || (h.status === "scheduled" && h.armed_at ? nowMs >= Date.parse(h.armed_at) + (h.prestart_sec ?? 0) * 1000 : false));

/** The next heat as the red banner's second part needs it: its planned start (the run order's own, break and warm-up included), its name and the estimate to show. */
export interface NextHeatInfo {
  startMs: number;
  title: string;
  est: string | null;
}

/**
 * "Next heat in 3:40 · Advanced · R2 · Heat 12 · est. 14:20", counting down to 0:00 and then "Next heat due · Advanced · R2 · Heat 12". It only says; nothing starts by
 * itself and no horn sounds for it.
 */
export function nextHeatPart(info: NextHeatInfo | null, nowMs: number): string | null {
  if (!info) return null;
  const left = info.startMs - nowMs;
  return left > 0 ? copy.flags.nextHeat.counting(formatClockMs(left), info.title, info.est) : copy.flags.nextHeat.due(info.title);
}

/** Does the red banner carry the "Next heat in" part: nothing is running and the reason is "finished" or "between heats" (not a pause, a hold or before the day). */
export const showsNextHeat = (state: FlagState): boolean => state.kind === "stopped" && (state.why === "finished" || state.why === "between");

/** The words on the strip: the state's label, or for red the reason with what comes next ("Finished — next: Heat 5, est. 10:40", "Paused", "Hold — times update when we resume"). With the "Next heat in" part beside it, the words are just the state word. */
export function flagWords(state: FlagState, next: string | null, withNextPart = false): string {
  if (state.kind !== "stopped") return state.label;
  if (withNextPart && showsNextHeat(state)) return state.label;
  const W = copy.flags.nextLine;
  switch (state.why) {
    case "finished":
      return W.finished(next);
    case "paused":
      return W.paused;
    case "hold":
      return W.hold;
    case "between":
      return W.between(next);
    default:
      return W.beforeDay(next);
  }
}
