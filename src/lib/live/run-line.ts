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
 * One line of the run order: "R1 · H2 · 14:05 · Ended" (started at 14:05) or "R1 · H3 · est. 14:20" (not started). It is never cut short: the row wraps.
 * `time` is the heat's own start when it has started, else the run order's estimate; `held` (wind hold) replaces the estimate with the word "held".
 */
export function runLine(input: { round?: { name: string; short_name: string | null }; heat: Pick<HeatRow, "name" | "number" | "number_suffix" | "started_at">; startedHhmm: string | null; estimatedHhmm: string | null; held: boolean; statusWord: string | null }): string {
  const time = input.heat.started_at && input.startedHhmm ? H.timeStarted(input.startedHhmm) : input.held ? H.heldWord : input.estimatedHhmm ? H.timeEstimated(input.estimatedHhmm) : null;
  return H.line([shortRound(input.round), shortHeat(input.heat), time, input.statusWord].filter((x): x is string => Boolean(x)));
}
