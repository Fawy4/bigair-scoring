import { effectiveStatus } from "./timer";
import type { HeatRow } from "./types";

/**
 * Console v2 §1: the head judge works on one division at a time. These are the rules of that selector, pure so they can be tested: what the tabs show,
 * which one is chosen when nobody chose, and the small dot on another division's tab while one of its heats is on.
 */
export interface DivisionTab {
  id: string;
  name: string;
}

/** The heats of one division, in the order they were given. */
export const heatsOfDivision = <H extends Pick<HeatRow, "division_id">>(heats: H[], divisionId: string | null): H[] => (divisionId ? heats.filter((h) => h.division_id === divisionId) : []);

const timing = (h: HeatRow) => ({ status: h.status, durationSec: h.duration_sec, startedAt: h.started_at, pausedAt: h.paused_at, pausedTotalSec: h.paused_total_sec });

/** A heat that is on the water: running (and not out of time) or paused. */
export const isLiveHeat = (h: HeatRow, nowServer: number): boolean => {
  const s = effectiveStatus(timing(h), nowServer);
  return s === "running" || s === "paused";
};

/** The divisions that have a heat running or paused right now (the live dot on their tab). */
export function liveDivisionIds(heats: HeatRow[], nowServer: number): Set<string> {
  return new Set(heats.filter((h) => isLiveHeat(h, nowServer)).map((h) => h.division_id));
}

/**
 * Which division the console shows. A choice remembered on this device wins while that division still exists; otherwise the division with a running heat,
 * else the division of the next heat of the run order, else the first division. No divisions: nothing.
 */
export function chooseDivision(input: { divisions: DivisionTab[]; heats: HeatRow[]; nextHeatDivisionId: string | null; remembered: string | null; nowServer: number }): string | null {
  const { divisions, heats, nextHeatDivisionId, remembered, nowServer } = input;
  const has = (id: string | null): id is string => Boolean(id && divisions.some((d) => d.id === id));
  if (has(remembered)) return remembered;
  const running = heats.find((h) => isLiveHeat(h, nowServer));
  if (running && has(running.division_id)) return running.division_id;
  if (has(nextHeatDivisionId)) return nextHeatDivisionId;
  return divisions[0]?.id ?? null;
}

/** The key a device remembers its division under: one per event, so two events on one phone do not mix. */
export const divisionStorageKey = (eventId: string): string => `bigair.head.division.${eventId}`;

/** Reads and writes the remembered division; every failure (private window, blocked storage) is "nothing remembered". */
export const rememberedDivision = {
  read(eventId: string, storage: Pick<Storage, "getItem"> | null): string | null {
    try {
      return storage?.getItem(divisionStorageKey(eventId)) || null;
    } catch {
      return null;
    }
  },
  write(eventId: string, divisionId: string, storage: Pick<Storage, "setItem"> | null): void {
    try {
      storage?.setItem(divisionStorageKey(eventId), divisionId);
    } catch {
      // not remembered: the console still works
    }
  },
};

/** The heat to show for a division: the one picked if it belongs to it, else the one running there, else the division's next heat, else its first heat not started. */
export function heatToShow(input: { heats: HeatRow[]; divisionId: string | null; pickedId: string | null; nextHeatId: string | null; nowServer: number }): string | null {
  const { heats, divisionId, pickedId, nextHeatId, nowServer } = input;
  const own = heatsOfDivision(heats, divisionId);
  if (pickedId && own.some((h) => h.id === pickedId)) return pickedId;
  const running = own.find((h) => isLiveHeat(h, nowServer));
  if (running) return running.id;
  if (nextHeatId && own.some((h) => h.id === nextHeatId)) return nextHeatId;
  return own.find((h) => h.status === "scheduled")?.id ?? own[own.length - 1]?.id ?? null;
}
