import type { HeatRow, SlotRow } from "./types";

/** What the server read straight after a press changed a heat: the heat row and its seats. The console puts it on the screen at once, without waiting for the live update. */
export interface AppliedState {
  heat: HeatRow;
  slots: SlotRow[];
}

/** The seats of one heat replaced by the ones the server just gave; every other heat's seats stay as they are. */
export const replaceHeatSlots = (current: SlotRow[], heatId: string, rows: SlotRow[]): SlotRow[] => [...current.filter((s) => s.heat_id !== heatId), ...rows];

const moment = (t: string | null | undefined): number => (t ? Date.parse(t) : NaN);

/**
 * The rows a refresh read, merged into the rows the screen holds: a row the screen already has in a NEWER state (the answer to a press, a live update) is kept over an older
 * row that arrives late — a read started before a press can finish after it. Rows with no time, or the same age, are taken as they arrived; a row the read did not return is dropped.
 */
export function mergeFresh<T extends { id: string; updated_at?: string | null }>(current: T[], arrived: T[]): T[] {
  const have = new Map(current.map((r) => [r.id, r] as const));
  return arrived.map((r) => {
    const mine = have.get(r.id);
    return mine && moment(mine.updated_at) > moment(r.updated_at) ? mine : r;
  });
}
