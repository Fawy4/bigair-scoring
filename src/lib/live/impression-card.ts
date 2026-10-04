import { cellTone } from "./cell-tone";
import type { JudgeImpressions } from "./impression-status";
import { formatCell } from "./matrix-model";

export interface ImpressionCardCell {
  seatId: string;
  state: "done" | "missing" | "absent";
  value: number | null;
  /** "7.5", "—" or "Absent": colour is never alone. */
  label: string;
  /** Distance from the panel mean, the same bands as the trick scores; null unless a score was given. */
  tone: { band: 0 | 1 | 2 | 3; delta: string } | null;
}
export interface ImpressionCardRow {
  entryId: string;
  cells: ImpressionCardCell[];
  /** The mean of the scores given; null while there is none. */
  panel: number | null;
  panelLabel: string;
}

/** What the Impression card shows: one row per rider (in the order given), one cell per judge, and the panel mean. `tolerance` is the Impression scale's own (a percentage of its range). */
export function impressionGrid(input: { impressions: JudgeImpressions[]; riderOrder: string[]; tolerance: number; words: { missing: string; absent: string } }): ImpressionCardRow[] {
  return input.riderOrder.map((entryId) => {
    const given = input.impressions.map((j) => ({ seatId: j.seatId, cell: j.cells.find((c) => c.entryId === entryId) }));
    const values = given.flatMap((g) => (g.cell?.state === "done" && g.cell.value !== null ? [g.cell.value] : []));
    const panel = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    const cells = given.map(({ seatId, cell }): ImpressionCardCell => {
      if (!cell || cell.state === "missing") return { seatId, state: "missing", value: null, label: input.words.missing, tone: null };
      if (cell.state === "absent") return { seatId, state: "absent", value: null, label: input.words.absent, tone: null };
      const value = cell.value as number;
      return { seatId, state: "done", value, label: formatCell(value), tone: panel !== null && values.length > 1 ? cellTone(value, panel, input.tolerance) : null };
    });
    return { entryId, cells, panel, panelLabel: panel === null ? input.words.missing : formatCell(panel) };
  });
}

/** The sizes the card can be drawn at: tighter spacing first, then smaller digits (the table's smallest text size), then it gives way to a button. */
export type CardLevel = 0 | 1 | 2;
export interface LevelSize {
  /** The rider's label column, a judge's column (and the Panel column), one rider row and the header row (name over J-number), in pixels. The card's heading is above the grid (TITLE_H), not in the header row. */
  labelW: number;
  cellW: number;
  rowH: number;
  headH: number;
  /** The text of the digits at this level: the body size, or the smallest size of the table. */
  small: boolean;
}
export const LEVELS: Record<CardLevel, LevelSize> = {
  0: { labelW: 132, cellW: 54, rowH: 24, headH: 32, small: false },
  1: { labelW: 112, cellW: 46, rowH: 20, headH: 28, small: false },
  2: { labelW: 96, cellW: 40, rowH: 17, headH: 26, small: true },
};
const PAD_W = 24; // the card's own padding and border (12 + 2) plus the room the cells take beyond their nominal width (measured: 10 px)
const PAD_H = 6;
/** The card's heading (the same heading style as the console's other sections) sits above the grid, left-aligned. */
export const TITLE_H = 30;
/**
 * The row of rider cards keeps at least this height whenever the card is on the console, so the table's top edge is in the same place for every heat. Fix 2: tall enough
 * for five riders and four judges at the smallest level (147 px), because the card stays a card at 1280 px and wider with 3, 4 and 5 riders.
 */
export const CARD_ROW_MIN = 148;
/** The least width the card is given beside the rider cards (smallest level); the rider cards shrink or wrap, never the card. */
export const cardMinWidth = (riders: number, judges: number): number => cardSize(2, riders, judges).w;
/** The width it would like (the tighter-spacing level), so a wide screen still gets a comfortable card. */
export const cardWantedWidth = (riders: number, judges: number): number => cardSize(1, riders, judges).w;

export const cardSize = (level: CardLevel, riders: number, judges: number): { w: number; h: number } => {
  const l = LEVELS[level];
  return { w: l.labelW + (judges + 1) * l.cellW + PAD_W, h: TITLE_H + l.headH + riders * l.rowH + PAD_H };
};

/** The first level at which the whole grid fits in the room beside the rider cards, or "button" when none does. It never asks for more room than there is. */
export function fitCard(input: { availW: number; availH: number; riders: number; judges: number }): CardLevel | "button" {
  for (const level of [0, 1, 2] as const) {
    const s = cardSize(level, input.riders, input.judges);
    if (s.w <= input.availW && s.h <= input.availH) return level;
  }
  return "button";
}
