/**
 * The fast clock (docs: simulator, speed ×1 / ×5 / ×10 / ×20). The database divides a simulated heat's length when the heat starts, so the phones, the head console and
 * the public page all read the shorter length through the normal paths. This is the same maths, for the panel and the virtual people.
 */

/** The heat's length at a speed: never below 3 seconds, so a ×20 clock on a very short heat still has a heat in it. Matches private.sim_fast_clock in the database. */
export function fastDuration(originalSec: number, speed: number): number {
  return Math.max(3, Math.ceil(originalSec / Math.max(1, speed)));
}

/** Seconds of the shortened clock that stand for `normalSec` seconds of a normal clock (a minute offline at ×10 is six seconds). */
export function scaledSec(normalSec: number, speed: number): number {
  return Math.max(1, normalSec / Math.max(1, speed));
}

export interface HeatClock {
  status: string;
  startedAt: string | null;
  pausedAt: string | null;
  pausedTotalSec: number;
  durationSec: number;
}

/** Seconds of the heat clock used so far: frozen at the pause while paused, never beyond the length. Server timestamps in, `nowMs` from the server's clock. */
export function elapsedSec(h: HeatClock, nowMs: number): number {
  if (!h.startedAt || h.status === "scheduled") return 0;
  const started = Date.parse(h.startedAt);
  const until = h.status === "paused" && h.pausedAt ? Date.parse(h.pausedAt) : nowMs;
  const used = (until - started) / 1000 - h.pausedTotalSec;
  return Math.min(h.durationSec, Math.max(0, used));
}

export const remainingSec = (h: HeatClock, nowMs: number): number => Math.max(0, h.durationSec - elapsedSec(h, nowMs));

/** 0 at the start, 1 when the time is up. */
export const fractionDone = (h: HeatClock, nowMs: number): number => (h.durationSec > 0 ? elapsedSec(h, nowMs) / h.durationSec : 1);

/** Real seconds since the heat started, not held back by pauses or the length (the offline minute is measured against this). */
export function sinceStartSec(h: Pick<HeatClock, "startedAt">, nowMs: number): number {
  return h.startedAt ? Math.max(0, (nowMs - Date.parse(h.startedAt)) / 1000) : 0;
}

/** Time is up on a running heat: the database ends it when the first device asks (end_heat_if_due). */
export const timeIsUp = (h: HeatClock, nowMs: number): boolean => h.status === "running" && remainingSec(h, nowMs) <= 0;
