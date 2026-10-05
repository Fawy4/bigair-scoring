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

/**
 * A pending row of the table: scores judges typed on the Rider sheet before the spotter logged the attempt. Greyed and hatched, no trick, never counted,
 * never published, never on a public page. `cells` holds each panel judge's note in that judge's column (null where the judge has none).
 */
export interface PendingMatrixRow {
  kind: "pending";
  id: string;
  /** The rider (the entry id). */
  riderKey: string;
  label: LabelModel;
  /** The line the row stands for, after the attempts logged. */
  n: number;
  /** The panel judges who hold a note on it, in panel order. */
  judgeIds: string[];
  cells: Array<{ judgeId: string; value: number | null; label: string }>;
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
