import type { FlagHeat } from "./flags";

/** "+1 min" on a running heat adds this much HEAT time. */
export const EXTEND_HEAT_SEC = 60;

/**
 * The seconds one press adds to the heat's clock: 60 on a real heat, a sixtieth-of-a-minute scaled down on a simulation (6 s at x10), never less than one second.
 * The database does the same sum (`public.extend_heat`: greatest(1, 60 / time_scale)); this is the screen's copy of the rule, for tests and for what a screen shows
 * before the answer comes back.
 */
export function extensionSec(timeScale: number | undefined): number {
  return Math.max(1, Math.floor(EXTEND_HEAT_SEC / Math.max(1, timeScale ?? 1)));
}

/** The heat as it is after one press: a longer length, the start and the pauses untouched. Every clock and the last-minute flag are derived from this alone. */
export function extendedHeat<T extends Pick<FlagHeat, "durationSec" | "timeScale">>(heat: T): T {
  return { ...heat, durationSec: heat.durationSec + extensionSec(heat.timeScale) };
}
