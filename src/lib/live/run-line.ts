import { copy } from "@/lib/ui-copy";
import type { HeatRow } from "./types";

const H = copy.headV2;
const DEFAULT_NAME = /^heat \d+/i;

/** "R1": the round's short name; failing that its name. */
export const shortRound = (round: { name: string; short_name: string | null } | undefined): string => round?.short_name?.trim() || round?.name || "";

/** "H2", "H3R" for a re-run. A heat the organiser gave a name of its own ("Final") keeps it. */
export function shortHeat(h: Pick<HeatRow, "name" | "number" | "number_suffix">): string {
  const named = h.name?.trim();
  return named && !DEFAULT_NAME.test(named) ? named : H.shortHeat(h.number, h.number_suffix);
}

/** "R1 · H3": round and heat, for the sentence that names the heat that was next. The division is added only when it is not the one on screen. */
export function shortTitle(input: { division?: string; round?: { name: string; short_name: string | null }; heat: Pick<HeatRow, "name" | "number" | "number_suffix">; withDivision?: boolean }): string {
  const parts = [input.withDivision ? input.division : "", shortRound(input.round), shortHeat(input.heat)].filter(Boolean) as string[];
  return H.line(parts);
}

/**
 * One line of the run order. A heat that has started: "R1 · H2 · planned 14:05 · started 14:11 · Ended"; one that has not: "R1 · H3 · est. 14:35".
 * `planned` is the time in the plan as written, `started` the real one; `held` (wind hold) replaces the estimate with the word "held". It is never cut short: the row wraps.
 */
export function runLine(input: { round?: { name: string; short_name: string | null }; heat: Pick<HeatRow, "name" | "number" | "number_suffix" | "started_at">; startedHhmm: string | null; estimatedHhmm: string | null; plannedHhmm?: string | null; held: boolean; statusWord: string | null }): string {
  const started = input.heat.started_at && input.startedHhmm;
  const times = started
    ? [input.plannedHhmm ? H.timePlanned(input.plannedHhmm) : null, H.timeStarted(input.startedHhmm!)]
    : [input.held ? H.heldWord : input.estimatedHhmm ? H.timeEstimated(input.estimatedHhmm) : null];
  return H.line([shortRound(input.round), shortHeat(input.heat), ...times, input.statusWord].filter((x): x is string => Boolean(x)));
}
