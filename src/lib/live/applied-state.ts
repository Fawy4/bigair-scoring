import type { HeatRow, SlotRow } from "./types";

/** What the server read straight after a press changed a heat: the heat row and its seats. The console puts it on the screen at once, without waiting for the live update. */
export interface AppliedState {
  heat: HeatRow;
  slots: SlotRow[];
}

/** The seats of one heat replaced by the ones the server just gave; every other heat's seats stay as they are. */
export const replaceHeatSlots = (current: SlotRow[], heatId: string, rows: SlotRow[]): SlotRow[] => [...current.filter((s) => s.heat_id !== heatId), ...rows];
