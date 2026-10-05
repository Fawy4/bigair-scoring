/**
 * The Rider sheet (judge screen, a second view beside the Queue). Pure: no I/O. The database does the same matching (migration `rider_sheet`, a trigger on
 * trick_attempts); tests/rls/rider-sheet.test.ts proves the two agree.
 *
 * Words: a LINE is a numbered row of one rider's sheet. Line n is the n-th attempt the spotter has logged for the rider (deleted attempts do not count, so the lines
 * renumber when one is deleted). An EMPTY line has no attempt yet. A PENDING note is a score a judge typed on an empty line; it is that judge's private note until
 * an attempt takes the line.
 *
 * A note is kept under the ATTEMPT NUMBER it will become (its slot), not under its line. Attempt numbers are never reused (the next attempt is the highest number
 * ever logged + 1), so when an attempt is deleted the line of every note behind it falls by one by itself: "the lines renumber and the pending notes behind it shift
 * up to the next real attempt" needs no moving of rows.
 */
export interface SheetAttempt {
  id: string;
  seq: number;
  status: "landed" | "crashed";
  trickName: string | null;
  direction: "left" | "right" | null;
  deleted: boolean;
}

/** One judge's pending note on one rider: the attempt number it waits for, and the score. */
export interface SheetNote {
  seatId: string;
  slot: number;
  score: number;
}

const live = (attempts: SheetAttempt[]) => attempts.filter((a) => !a.deleted).sort((a, b) => a.seq - b.seq);
const maxSeq = (attempts: SheetAttempt[]) => attempts.reduce((m, a) => Math.max(m, a.seq), 0);

/** The attempt number a note on empty line `line` waits for; null when that line already has an attempt (then it is a score, not a note). */
export function slotForLine(attempts: SheetAttempt[], line: number): number | null {
  const n = live(attempts).length;
  return line > n ? maxSeq(attempts) + (line - n) : null;
}

/** The line a note waits on now (it falls by one when an attempt before it is deleted); null when its attempt number has already been logged. */
export function lineOfSlot(attempts: SheetAttempt[], slot: number): number | null {
  return slot > maxSeq(attempts) ? live(attempts).length + (slot - maxSeq(attempts)) : null;
}

/** Number of lines on a rider's sheet: the cap (7 for Arrow), never fewer than the attempts logged; with no cap the logged attempts plus one empty line ahead. */
export function lineCount(attempts: SheetAttempt[], cap: number | null): number {
  const n = live(attempts).length;
  return cap === null ? n + 1 : Math.max(cap, n);
}

/** May a note be typed on this line? Only an empty line, and only up to the cap (with no cap: only the one line ahead). */
export function allowedLine(attempts: SheetAttempt[], cap: number | null, line: number): boolean {
  const n = live(attempts).length;
  if (!Number.isInteger(line) || line <= n || line < 1) return false;
  return cap === null ? line <= n + 1 : line <= cap;
}

export interface SheetLine {
  n: number;
  kind: "attempt" | "crash" | "empty";
  attemptId?: string;
  seq?: number;
  trickName: string | null;
  direction: "left" | "right" | null;
  /** This judge's score on the attempt (a number, "missed", or null when none yet). */
  mine: number | "missed" | null;
  /** This judge's pending note on an empty line. */
  pending: number | null;
  /** Where a note on this empty line is kept (null on a line with an attempt). */
  slot: number | null;
}

/** The lines of one rider's sheet for one judge. */
export function buildLines(i: { attempts: SheetAttempt[]; notes: SheetNote[]; cap: number | null; mine?: Map<string, number | "missed"> }): SheetLine[] {
  const logged = live(i.attempts);
  const total = lineCount(i.attempts, i.cap);
  const out: SheetLine[] = [];
  for (let n = 1; n <= total; n++) {
    const a = logged[n - 1];
    if (a) {
      out.push({ n, kind: a.status === "crashed" ? "crash" : "attempt", attemptId: a.id, seq: a.seq, trickName: a.trickName, direction: a.direction, mine: a.status === "crashed" ? null : (i.mine?.get(a.id) ?? null), pending: null, slot: null });
      continue;
    }
    const slot = slotForLine(i.attempts, n);
    const held = i.notes.find((x) => x.slot === slot);
    out.push({ n, kind: "empty", trickName: null, direction: null, mine: null, pending: held ? held.score : null, slot });
  }
  return out;
}

export interface Settled {
  /** Notes that became a judge's score on a landed attempt. */
  scores: Array<{ attemptId: string; seatId: string; score: number }>;
  /** Notes discarded because the attempt on their line was a crash (judges never score crashes), or their line is gone. */
  discarded: SheetNote[];
  /** Notes still waiting for their attempt. */
  remaining: SheetNote[];
}

/**
 * The matching rule, for one rider: every attempt (in order of logging, that is by number) takes the note kept under its number from each judge. A landed attempt
 * turns it into that judge's score at once; a crash discards it. By order of logging, never by the time the note was typed. Notes whose number has not been
 * logged yet stay.
 */
export function settleNotes(attempts: SheetAttempt[], notes: SheetNote[]): Settled {
  const out: Settled = { scores: [], discarded: [], remaining: [] };
  const bySeq = new Map(live(attempts).map((a) => [a.seq, a]));
  const top = maxSeq(attempts);
  const ordered = [...notes].sort((a, b) => a.slot - b.slot);
  for (const n of ordered) {
    if (n.slot > top) out.remaining.push(n);
    else {
      const a = bySeq.get(n.slot);
      if (a && a.status === "landed") out.scores.push({ attemptId: a.id, seatId: n.seatId, score: n.score });
      else out.discarded.push(n); // a crash, or an attempt number that no longer exists
    }
  }
  return out;
}

export interface ConsoleRow {
  /** The line (attempt number-to-be) the row stands for, after the logged attempts. */
  n: number;
  /** The judges who hold a note on it. */
  judges: string[];
  /** Each judge's note by the judge's own key (seat or "J1"). */
  cells: Record<string, number>;
}

/** The console's pending rows for one rider: one per line that holds a note, after the logged attempts, in line order. */
export function consoleRows(attempts: SheetAttempt[], notes: SheetNote[]): ConsoleRow[] {
  const rows = new Map<number, ConsoleRow>();
  for (const x of notes) {
    const n = lineOfSlot(attempts, x.slot);
    if (n === null) continue;
    const row = rows.get(n) ?? { n, judges: [], cells: {} };
    row.judges.push(x.seatId);
    row.cells[x.seatId] = x.score;
    rows.set(n, row);
  }
  return [...rows.values()].sort((a, b) => a.n - b.n).map((r) => ({ ...r, judges: [...r.judges].sort() }));
}

export interface NoteBlocker {
  entryId: string;
  seatId: string;
  lines: number[];
}

/**
 * What blocks Publish: every judge who still holds a note on a rider. The lines are the attempt numbers the notes wait for (the console's pending rows are
 * numbered after the logged attempts, so the head judge sees the same numbers); callers who know the attempts show the line instead.
 */
export function noteBlockers(notes: Array<SheetNote & { entryId: string }>): NoteBlocker[] {
  const out = new Map<string, NoteBlocker>();
  for (const n of notes) {
    const key = `${n.entryId}|${n.seatId}`;
    const b = out.get(key) ?? { entryId: n.entryId, seatId: n.seatId, lines: [] };
    b.lines.push(n.slot);
    out.set(key, b);
  }
  return [...out.values()].map((b) => ({ ...b, lines: b.lines.sort((x, y) => x - y) })).sort((a, b) => a.entryId.localeCompare(b.entryId) || a.seatId.localeCompare(b.seatId));
}

/** The lines a judge's own notes sit on, per rider, for the refusal at Submit. */
export function submitBlockLines(notes: Array<SheetNote & { entryId: string }>, rider: (entryId: string) => { attempts: SheetAttempt[] }): Array<{ entryId: string; lines: number[] }> {
  const out = new Map<string, number[]>();
  for (const n of notes) {
    const line = lineOfSlot(rider(n.entryId).attempts, n.slot);
    if (line === null) continue;
    out.set(n.entryId, [...(out.get(n.entryId) ?? []), line]);
  }
  return [...out.entries()].map(([entryId, lines]) => ({ entryId, lines: lines.sort((a, b) => a - b) })).sort((a, b) => a.entryId.localeCompare(b.entryId));
}

// ---- the switch "Queue / Rider sheet": remembered per device, default Queue
export type JudgeView = "queue" | "sheet";
export const viewPreference = {
  key: (eventId: string) => `bigair.judgeView.${eventId}`,
  read(eventId: string, storage: Pick<Storage, "getItem"> | undefined): JudgeView {
    try {
      return storage?.getItem(viewPreference.key(eventId)) === "sheet" ? "sheet" : "queue";
    } catch {
      return "queue";
    }
  },
  write(eventId: string, view: JudgeView, storage: Pick<Storage, "setItem"> | undefined): void {
    try {
      storage?.setItem(viewPreference.key(eventId), view);
    } catch {
      /* private mode: the choice lasts until the page closes */
    }
  },
};
