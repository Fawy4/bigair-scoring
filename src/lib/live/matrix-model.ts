import type { LabelModel } from "@/lib/identification/rider-label";

/** The head judge's score table (docs/06 §6): one row per attempt, one cell per judge. States are shown with a word as well as a colour. */
export type CellState = "scored" | "missing" | "missed" | "absent" | "outlier" | "crash" | "deleted" | "duplicate";
export type RowState = "ok" | "deleted" | "duplicate";
export type PanelState = "ok" | "incomplete" | "outlier" | "none";

export interface MatrixCell {
  judgeId: string;
  state: CellState;
  value: number | null;
  /** What the cell says: the score, or an em dash when there is none. */
  label: string;
}

export interface MatrixRow {
  id: string;
  seq: number;
  label: LabelModel;
  trick: string;
  status: "landed" | "crashed";
  state: RowState;
  cells: MatrixCell[];
  panel: number | null;
  panelLabel: string;
  panelState: PanelState;
}

export interface MatrixModel {
  judgeIds: string[];
  rows: MatrixRow[];
}

/** A judge's trick score as written in the table: up to three decimals, never fewer than two (7.625, 7.75, 8.25). */
export function formatCell(value: number): string {
  const three = value.toFixed(3);
  return three.endsWith("0") ? value.toFixed(2) : three;
}
