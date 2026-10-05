import { anyHeatStarted, armedStartMs, flagHeatOf, flagState, flagWords, isArmedNow, nextHeatPart, showsNextHeat, type FlagHeat, type FlagState, type NextHeatInfo } from "@/lib/live/flags";
import { parseFlagSettings, type FlagSettings } from "@/lib/schemas/flags";
import type { PublicTimetableModel } from "./timetable";
import { heatLabel } from "./timetable";
import type { PublicTimetable, TimetableHeat } from "./types";

/**
 * What a public screen needs to draw the flags, all plain values (it crosses from the server to the browser): the event's flag settings, the heat the flags are
 * about with its time stamps, the server's clock of that moment, and the words that say what comes next. The browser works the state out itself from the time
 * stamps, so between two refreshes the colours change on the second.
 */
export interface PublicFlagData {
  settings: FlagSettings;
  serverNow: string;
  heat: FlagHeat | null;
  heatId: string | null;
  heatName: string;
  heatShort: string;
  onHold: boolean;
  anyHeatStarted: boolean;
  /** "Heat 5, est. 10:40" for the red flag between heats. */
  next: string | null;
  /** The break read from the run order (the one source every screen counts down to), or null. */
  nextHeat: NextHeatInfo | null;
}

const asFlagHeat = (h: TimetableHeat): FlagHeat => flagHeatOf({ id: h.id, status: h.status, duration_sec: h.duration_sec, started_at: h.started_at, paused_at: h.paused_at, paused_total_sec: h.paused_total_sec, armed_at: h.armed_at ?? null, prestart_sec: h.prestart_sec ?? null, armed_paused_at: h.armed_paused_at ?? null, time_scale: h.time_scale ?? 1 });

/** The heat the flags are about: the heat in its pre-start, else the one on the water (running or paused), else the one that started last. */
export function pickPublicFlagHeat(heats: TimetableHeat[], nowMs: number): TimetableHeat | null {
  const armed = heats.find((h) => isArmedNow({ id: h.id, status: h.status, duration_sec: h.duration_sec, started_at: h.started_at, paused_at: h.paused_at, paused_total_sec: h.paused_total_sec, armed_at: h.armed_at ?? null, prestart_sec: h.prestart_sec ?? null, armed_paused_at: h.armed_paused_at ?? null, time_scale: h.time_scale ?? 1 }, nowMs));
  if (armed) return armed;
  const onWater = heats.find((h) => h.status !== "cancelled" && (h.effective_status === "running" || h.effective_status === "paused"));
  if (onWater) return onWater;
  let best: TimetableHeat | null = null;
  for (const h of heats) if (h.started_at && h.status !== "cancelled" && (!best || Date.parse(h.started_at) > Date.parse(best.started_at!))) best = h;
  return best;
}

export function publicFlagData(timetable: PublicTimetable | null, tt: PublicTimetableModel, flagsJson: unknown): PublicFlagData | null {
  const settings = parseFlagSettings(flagsJson ?? timetable?.flags);
  if (!settings.enabled || !timetable) return null;
  const nowMs = Date.parse(timetable.server_now);
  const heat = pickPublicFlagHeat(timetable.heats, nowMs);
  const title = (id: string | null, fallback: string): string => (id ? (tt.rows.find((r) => r.heatId === id)?.title ?? fallback) : fallback);
  const up = tt.upNext[0] ?? null;
  return {
    settings,
    serverNow: timetable.server_now,
    heat: heat ? asFlagHeat(heat) : null,
    heatId: heat?.id ?? null,
    heatName: heat ? title(heat.id, heatLabel(heat)) : "",
    heatShort: heat ? heatLabel(heat) : "",
    onHold: tt.onHold,
    anyHeatStarted: anyHeatStarted(timetable.heats.map((h) => ({ started_at: h.started_at, status: h.status, armed_at: h.armed_at ?? null, prestart_sec: h.prestart_sec ?? null, armed_paused_at: h.armed_paused_at ?? null })), nowMs),
    next: up ? (up.start ? `${up.title}, est. ${up.start}` : up.title) : null,
    nextHeat: tt.breakNext ?? null,
  };
}

/** The state at a given server time, with the words for the strip. Null when the flags are off. */
export function publicFlagAt(d: PublicFlagData, nowMs: number): { state: FlagState; words: string; nextPart: string | null } | null {
  const state = flagState({ settings: d.settings, heat: d.heat, nowMs, onHold: d.onHold, anyHeatStarted: d.anyHeatStarted });
  if (!state) return null;
  // the red banner keeps its state word; beside it the break counts down to the next heat (from the run order; nothing starts by itself)
  const nextPart = showsNextHeat(state) ? nextHeatPart(d.nextHeat ?? null, nowMs) : null;
  return { state, words: flagWords(state, d.next, nextPart !== null), nextPart };
}

export { armedStartMs };
