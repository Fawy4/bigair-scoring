import type { StartNextHeat } from "@/lib/schemas/event-settings";
import { effectiveStatus } from "./timer";
import type { HeatRow } from "./types";

/**
 * HE1 — "Start the next heat". What the head judge's console decides on its own, in pure functions: when to raise the ten-second notice, and what the notice says.
 * The database has the last word (it re-checks every rule when the notice runs out); these only keep the console from asking for something that cannot be.
 */

/** The notice the head judge sees: "Next heat sequence starts in 10 s — Stop". */
export const NOTICE_SEC = 10;
/** After a refusal the console waits this long before it asks again (a Hold or a wind call can last minutes). */
export const RETRY_AFTER_REFUSAL_MS = 5_000;

const timing = (h: HeatRow) => ({ status: h.status, durationSec: h.duration_sec, startedAt: h.started_at, pausedAt: h.paused_at, pausedTotalSec: h.paused_total_sec });

/** A heat that is on the water, waiting for its result or in its pre-start: the next heat does not start while any of these exists. */
export function heatInPlay(h: HeatRow, nowServer: number): boolean {
  if (h.status === "scheduled") return Boolean(h.armed_at);
  const eff = effectiveStatus(timing(h), nowServer);
  return eff === "running" || eff === "paused" || eff === "ended" || eff === "under_review";
}

export interface AutoStartNotice {
  heatId: string;
  mode: "after_publish" | "run_order";
  secondsLeft: number;
  /** The notice has run out: the database starts the sequence on the next ask (a second or two). */
  due: boolean;
}

/** The notice to show: the heat that has one, with the seconds left (never more than 10). Null when no heat has a notice or the heat has been armed since. */
export function autoStartNotice(heats: HeatRow[], nowServer: number): AutoStartNotice | null {
  const h = heats.find((x) => x.status === "scheduled" && !x.armed_at && x.auto_start_at && x.auto_start_mode);
  if (!h || !h.auto_start_at || !h.auto_start_mode) return null;
  const left = Date.parse(h.auto_start_at) - nowServer;
  return { heatId: h.id, mode: h.auto_start_mode, secondsLeft: Math.min(NOTICE_SEC, Math.max(0, Math.ceil(left / 1000))), due: left <= 0 };
}

export interface PlanInput {
  setting: StartNextHeat;
  /** The head judge's switch has turned auto start off. */
  off: boolean;
  nextHeatId: string | null;
  heats: HeatRow[];
  nowServer: number;
  /** The run order is on Hold. */
  hold: boolean;
}

/** The first checks both modes share: the setting is on, the next heat waits with no notice, nothing is in play, no Hold. */
function mayPlan(i: PlanInput, mode: "after_publish" | "run_order"): HeatRow | null {
  if (i.setting !== mode || i.off || i.hold || !i.nextHeatId) return null;
  const next = i.heats.find((h) => h.id === i.nextHeatId);
  if (!next || next.status !== "scheduled" || next.armed_at || next.auto_start_at) return null;
  if (i.heats.some((h) => h.id !== next.id && heatInPlay(h, i.nowServer))) return null;
  return next;
}

/**
 * After Publish: should the console raise the notice for the next heat? Only when the heat just published is the latest one that was started (publishing an older heat
 * again, after a correction, never starts anything), and the other rules hold.
 */
export function planAfterPublish(i: PlanInput & { publishedId: string }): { heatId: string } | null {
  const next = mayPlan(i, "after_publish");
  if (!next) return null;
  const published = i.heats.find((h) => h.id === i.publishedId);
  if (!published?.started_at) return null;
  const latest = Math.max(...i.heats.filter((h) => h.started_at).map((h) => Date.parse(h.started_at as string)));
  if (Date.parse(published.started_at) < latest) return null;
  return { heatId: next.id };
}

/**
 * At the run order time: the console asks once the sequence is due within ten seconds (the heat's start in the run order, less the pre-start). The database makes the notice
 * exactly ten seconds when it is due sooner, so a head judge who is late gets the notice and then the sequence, never a sequence without a warning.
 */
export function planAtRunOrderTime(i: PlanInput & { startMs: number | null; held: boolean; flagsOn: boolean; prestartSec: number }): { heatId: string; heatStartAt: string } | null {
  const next = mayPlan(i, "run_order");
  if (!next || i.startMs === null || i.held) return null;
  const sequenceAt = i.startMs - (i.flagsOn ? i.prestartSec * 1000 : 0);
  if (sequenceAt - i.nowServer > NOTICE_SEC * 1000 + 500) return null;
  return { heatId: next.id, heatStartAt: new Date(i.startMs).toISOString() };
}
