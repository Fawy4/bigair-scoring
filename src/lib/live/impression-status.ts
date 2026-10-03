import type { ImpressionRow, SlotRow } from "./types";

export type ImpressionCellState = "done" | "missing" | "absent";
export interface ImpressionCell {
  entryId: string;
  state: ImpressionCellState;
  /** The score given, when done. */
  value: number | null;
}
export interface JudgeImpressions {
  seatId: string;
  cells: ImpressionCell[];
  /** How many riders still have no Impression / Variety score from this judge. */
  missing: number;
}

/**
 * Each panel judge's Impression / Variety scores, rider by rider in seat order (Polish 2, item 5): done, missing, or Absent (set by the head judge). Riders who
 * did not start or were disqualified need none, as the scoring engine says; a rider who did not finish does.
 */
export function impressionStatus(input: { panelSeatIds: string[]; slots: SlotRow[]; impressions: ImpressionRow[] }): JudgeImpressions[] {
  const riders = input.slots
    .filter((s) => s.entry_id && s.modifier !== "DNS" && s.modifier !== "DSQ")
    .sort((a, b) => a.position - b.position)
    .map((s) => s.entry_id as string);
  return input.panelSeatIds.map((seatId) => {
    const cells = riders.map((entryId): ImpressionCell => {
      const row = input.impressions.find((i) => i.judge_seat_id === seatId && i.entry_id === entryId);
      if (!row) return { entryId, state: "missing", value: null };
      if (row.missed) return { entryId, state: "absent", value: null };
      return { entryId, state: "done", value: row.value === null ? null : Number(row.value) };
    });
    return { seatId, cells, missing: cells.filter((c) => c.state === "missing").length };
  });
}
