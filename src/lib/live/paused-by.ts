import { copy } from "@/lib/ui-copy";
import type { HeatRow } from "./types";

/** "Paused by the simulator" under the heat clock while the simulator's Pause or Stop holds the heat; null for any other state (the head judge's own pause says "Paused"). */
export function pausedByWords(h: Pick<HeatRow, "status" | "paused_reason"> | null | undefined): string | null {
  return h && h.status === "paused" && h.paused_reason === "simulator" ? copy.heatControl.pausedBySimulator : null;
}
