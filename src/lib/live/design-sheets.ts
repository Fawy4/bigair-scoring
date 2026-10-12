import type { LoggedAttemptRow } from "./spotter-sheet";
import type { SheetLine } from "./rider-sheet";

/**
 * Made-up Rider sheet lines for the /design page (the composed screens of the New look). Pure data: the real screens build theirs from the database.
 * Sam Rivera (Red) has two scored lines, a crash, two logged attempts still waiting for the judge's score (the first of them pulses) and two empty lines — 7 lines.
 */
const attempt = (n: number, trick: string, direction: "left" | "right", mine: number | "missed" | null): SheetLine => ({ n, kind: "attempt", attemptId: `a${n}`, seq: n, trickName: trick, direction, mine, pending: null, slot: null, open: true });
const crash = (n: number, trick: string, direction: "left" | "right"): SheetLine => ({ n, kind: "crash", attemptId: `a${n}`, seq: n, trickName: trick, direction, mine: null, pending: null, slot: null, open: true });
const empty = (n: number): SheetLine => ({ n, kind: "empty", trickName: null, direction: null, mine: null, pending: null, slot: n, open: true });

export function designSheetLines(): Record<string, SheetLine[]> {
  return {
    red: [attempt(1, "Kiteloop board-off", "left", 8), attempt(2, "Double loop", "right", 7.5), crash(3, "Late backroll", "left"), attempt(4, "Contra loop", "left", null), attempt(5, "Backroll", "right", null), empty(6), empty(7)],
    blue: [attempt(1, "Backroll", "left", 7), attempt(2, "Frontroll", "right", 6.5), crash(3, "Double loop", "left"), attempt(4, "Frontroll", "right", null), empty(5), empty(6), empty(7)],
    yellow: [attempt(1, "Kiteloop", "left", 6), attempt(2, "Backroll", "right", 7.5), crash(3, "Megaloop", "left"), attempt(4, "Frontroll", "right", 6.5), crash(5, "Contra loop", "left"), attempt(6, "Backroll", "left", 7), attempt(7, "Straight jump", "right", 5)],
    green: [attempt(1, "Kiteloop", "right", 8), attempt(2, "Handle pass", "left", 8.5), attempt(3, "Kiteloop", "left", null), empty(4), empty(5), empty(6), empty(7)],
  };
}

/** The same riders as the spotter logs them (rider id → rows). */
export function designSpotterAttempts(): Array<LoggedAttemptRow & { entryId: string }> {
  const row = (entryId: string, seq: number, trick: string, direction: "left" | "right", status: "landed" | "crashed" = "landed"): LoggedAttemptRow & { entryId: string } => ({
    entryId,
    id: `${entryId}-${seq}`,
    seq,
    clientKey: `${entryId}-${seq}`,
    status,
    trickName: trick,
    direction,
    rawText: trick,
    mine: true,
    deleted: false,
  });
  return [
    row("red", 1, "Kiteloop board-off", "left"),
    row("red", 2, "Double loop", "right"),
    row("red", 3, "Late backroll", "left", "crashed"),
    row("red", 4, "Contra loop", "left"),
    row("red", 5, "Backroll", "right"),
    row("blue", 1, "Backroll", "left"),
    row("blue", 2, "Frontroll", "right"),
    row("blue", 3, "Double loop", "left", "crashed"),
    row("blue", 4, "Frontroll", "right"),
    row("yellow", 1, "Kiteloop", "left"),
    row("green", 1, "Kiteloop", "right"),
    row("green", 2, "Handle pass", "left"),
    row("green", 3, "Kiteloop", "left"),
  ];
}
