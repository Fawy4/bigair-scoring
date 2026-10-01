import { effectiveStatus, type HeatTiming } from "./timer";
import type { HeatRow } from "./types";

export type HeatPhase = "running" | "paused" | "ended" | "none";

export interface PickInput {
  heats: HeatRow[];
  /** Panels by division, so a judge follows only the heats they sit on. */
  panels: Array<{ divisionId: string; seatIds: string[] }>;
  viewer: { role: "judge" | "head" | "spotter" | "announcer" | "organiser"; seatId?: string };
  nowServer: number;
  /** `?heat=` on the address. */
  pinnedId?: string | null;
  /** Heats whose sheet this judge has submitted (their impression step is finished). */
  submittedHeatIds?: ReadonlySet<string>;
}

const timing = (h: HeatRow): HeatTiming => ({ status: h.status, durationSec: h.duration_sec, startedAt: h.started_at, pausedAt: h.paused_at, pausedTotalSec: h.paused_total_sec });
const startedMs = (h: HeatRow) => (h.started_at ? Date.parse(h.started_at) : 0);
/** An ended heat stays in front of a judge, waiting for their Impression / Variety scores, for at most this long. */
const ENDED_WINDOW_MS = 12 * 3_600_000;

export function heatEnd(h: HeatRow): number {
  return h.ended_at ? Date.parse(h.ended_at) : startedMs(h) + (h.duration_sec + h.paused_total_sec) * 1000;
}

/**
 * Which heat an official's phone shows by itself: the running one (else the paused one); for a judge, a heat of their own panel. When none is
 * running a judge stays on the heat that has just ended until their sheet is submitted (the Impression / Variety step); everybody else sees
 * "Next: …". A heat pinned with `?heat=` wins.
 */
export function pickCurrentHeat(i: PickInput): { heat: HeatRow | null; phase: HeatPhase } {
  const scores = i.viewer.role === "judge" || i.viewer.role === "head";
  const mine = i.heats.filter((h) => {
    if (h.status === "cancelled") return false;
    if (i.viewer.role !== "judge") return true;
    return i.panels.some((p) => p.divisionId === h.division_id && i.viewer.seatId && p.seatIds.includes(i.viewer.seatId));
  });
  const phaseOf = (h: HeatRow): HeatPhase => {
    const s = effectiveStatus(timing(h), i.nowServer);
    return s === "running" ? "running" : s === "paused" ? "paused" : s === "scheduled" ? "none" : "ended";
  };
  if (i.pinnedId) {
    const pinned = mine.find((h) => h.id === i.pinnedId);
    if (pinned) return { heat: pinned, phase: phaseOf(pinned) };
  }
  const running = mine.filter((h) => phaseOf(h) === "running").sort((a, b) => startedMs(a) - startedMs(b));
  if (running[0]) return { heat: running[0], phase: "running" };
  const paused = mine.filter((h) => phaseOf(h) === "paused").sort((a, b) => startedMs(a) - startedMs(b));
  if (paused[0]) return { heat: paused[0], phase: "paused" };
  if (scores) {
    const waiting = mine
      .filter((h) => phaseOf(h) === "ended" && (h.status === "ended" || h.status === "running") && !i.submittedHeatIds?.has(h.id) && i.nowServer - heatEnd(h) < ENDED_WINDOW_MS)
      .sort((a, b) => heatEnd(b) - heatEnd(a));
    if (waiting[0]) return { heat: waiting[0], phase: "ended" };
  }
  return { heat: null, phase: "none" };
}
