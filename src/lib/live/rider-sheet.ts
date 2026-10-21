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
import { parseTrickText, referenceScore, type ReferenceScore, type TrickParts, type TrickVocab } from "@/lib/engine/tricks";
import type { ReferenceTable } from "@/lib/schemas/reference-scores";

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
  /** The judge did not see the attempt that will take this line: the note is "Missed" (the score field is then not read). */
  missed?: boolean;
  /** A division scored by criteria: the value of every criterion; `score` is then the trick score worked out from them. */
  criteria?: Record<string, number>;
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

/** With no attempt limit the judge's sheet starts with this many lines, like the spotter's. */
export const OPEN_LINES = 10;
/** With no attempt limit a judge may score this many lines past the attempts the spotter has logged (the database's rule: the 10 lines the sheet starts with). */
export const NO_LIMIT_AHEAD = 10;

/**
 * Number of lines on a rider's sheet at the start: the cap (7 for Arrow), never fewer than the attempts logged; with no cap 10 lines (or the attempts logged, if
 * more). With no cap `buildLines` then adds a line each time the last one is filled.
 */
export function lineCount(attempts: SheetAttempt[], cap: number | null): number {
  const n = live(attempts).length;
  return cap === null ? Math.max(OPEN_LINES, n) : Math.max(cap, n);
}

/**
 * May a note be typed on this line, as the database allows it? Only an empty line, and only up to the cap (with no cap: only the one line ahead of the attempts
 * logged). A rule of the server: the sheet asks the server's question, so a line it cannot keep a note on is not offered.
 */
export function allowedLine(attempts: SheetAttempt[], cap: number | null, line: number): boolean {
  const n = live(attempts).length;
  if (!Number.isInteger(line) || line <= n || line < 1) return false;
  return cap === null ? line <= n + NO_LIMIT_AHEAD : line <= cap;
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
  /** This judge's pending note on an empty line: a score, or "missed". */
  pending: number | "missed" | null;
  /** Where a note on this empty line is kept (null on a line with an attempt). */
  slot: number | null;
  /** A division scored by criteria: what is typed in the criterion boxes of this line so far (all of them once the line has its score). Absent in a one-score division. */
  criteria?: Record<string, number>;
  /**
   * The server can keep a score here. Always true with an attempt limit (every line up to the limit) and on a line that has its attempt; with no limit the server keeps
   * a note up to 10 lines past the attempts logged (`allowedLine`), so a line further down is shown but closed until the spotter has logged more.
   */
  open: boolean;
  /** The reference score of the logged trick, shown to the judge as a hint (never a score); absent when the trick has none. Added by the screen, not by `buildLines`. */
  reference?: ReferenceScore | null;
  /** HE1: a line logged after this judge submitted ("New attempt to score"). Added by the screen, not by `buildLines`. */
  fresh?: boolean;
}

/**
 * Puts the reference score (the hint) on the lines that have a landed trick: worked out from the trick as the spotter logged it. A trick the head judge typed or
 * corrected as plain words (it has no blocks stored, or a word nobody recognised) is read again from its name with the whole trick base, and gets a hint only when
 * every word is recognised. A crash, an empty line and a trick that is not on the judges' list get none, and with no list at all every line is returned as it was.
 */
export function withReferences(lines: SheetLine[], partsOf: (attemptId: string) => unknown, vocab: TrickVocab, table: ReferenceTable | null): SheetLine[] {
  if (!table) return lines;
  const everyBlock = vocab.blocks.map((b) => b.id);
  return lines.map((line) => {
    if (line.kind !== "attempt" || !line.attemptId) return line;
    const parts = partsOf(line.attemptId) as TrickParts | null | undefined;
    let reference = parts && Array.isArray(parts.items) ? referenceScore(vocab, table, parts) : null;
    if (!reference && line.trickName) {
      const read = parseTrickText(vocab, line.trickName, everyBlock);
      if (!read.needsReview && !read.parts.freeText?.trim()) reference = referenceScore(vocab, table, read.parts);
    }
    return reference ? { ...line, reference } : line;
  });
}

/** The lines of one rider's sheet for one judge. With no cap, a new empty line follows as soon as the last line is done, so the judge never runs out of lines. */
export function buildLines(i: {
  attempts: SheetAttempt[];
  notes: SheetNote[];
  cap: number | null;
  mine?: Map<string, number | "missed">;
  /**
   * What this judge typed ahead of the spotter, by attempt number, remembered by the phone. A line the judge filled ahead is covered the moment its attempt arrives:
   * the note on the server turns into the score a moment later, and until then the line shows what the judge typed and nothing lights up.
   */
  ahead?: Map<number, number | "missed">;
  /** A division scored by criteria: the criterion keys in the division's order. Without it every line has one score box. */
  criteriaKeys?: string[];
  /** The criteria on this judge's scores on the server, by attempt id. */
  criteriaOf?: Map<string, Record<string, number>>;
  /** Boxes typed on a line that is not complete yet (kept on the phone), by attempt number. */
  drafts?: Map<number, Record<string, number>>;
}): SheetLine[] {
  const logged = live(i.attempts);
  const total = lineCount(i.attempts, i.cap);
  const out: SheetLine[] = [];
  const make = (n: number): SheetLine => {
    const a = logged[n - 1];
    if (a) {
      const held = i.notes.find((x) => x.slot === a.seq);
      const typedAhead = held ? (held.missed ? ("missed" as const) : held.score) : (i.ahead?.get(a.seq) ?? null);
      const mine = a.status === "crashed" ? null : (i.mine?.get(a.id) ?? typedAhead);
      const criteria = i.criteriaKeys && a.status !== "crashed" ? (i.criteriaOf?.get(a.id) ?? held?.criteria ?? i.drafts?.get(a.seq)) : undefined;
      return { n, kind: a.status === "crashed" ? "crash" : "attempt", attemptId: a.id, seq: a.seq, trickName: a.trickName, direction: a.direction, mine, pending: null, slot: null, open: true, ...(criteria ? { criteria } : {}) };
    }
    const slot = slotForLine(i.attempts, n);
    const held = i.notes.find((x) => x.slot === slot);
    const criteria = i.criteriaKeys ? (held?.criteria ?? (slot === null ? undefined : i.drafts?.get(slot))) : undefined;
    return { n, kind: "empty", trickName: null, direction: null, mine: null, pending: held ? (held.missed ? "missed" : held.score) : null, slot, open: allowedLine(i.attempts, i.cap, n), ...(criteria ? { criteria } : {}) };
  };
  for (let n = 1; n <= total; n++) out.push(make(n));
  if (i.cap === null) while (out.length > 0 && lineDone(out[out.length - 1])) out.push(make(out.length + 1));
  return out;
}

export interface Settled {
  /** Notes that became a judge's score on a landed attempt. */
  scores: Array<{ attemptId: string; seatId: string; score: number | null; missed?: true; criteria?: Record<string, number> }>;
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
      if (a && a.status === "landed") out.scores.push(n.missed ? { attemptId: a.id, seatId: n.seatId, score: null, missed: true } : { attemptId: a.id, seatId: n.seatId, score: n.score, ...(n.criteria ? { criteria: n.criteria } : {}) });
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
  /** The judges whose note is "Missed" (their cell is not a number). */
  missed: Record<string, true>;
}

/** The console's pending rows for one rider: one per line that holds a note, after the logged attempts, in line order. */
export function consoleRows(attempts: SheetAttempt[], notes: SheetNote[]): ConsoleRow[] {
  const rows = new Map<number, ConsoleRow>();
  for (const x of notes) {
    const n = lineOfSlot(attempts, x.slot);
    if (n === null) continue;
    const row = rows.get(n) ?? { n, judges: [], cells: {}, missed: {} };
    row.judges.push(x.seatId);
    row.cells[x.seatId] = x.score;
    if (x.missed) row.missed[x.seatId] = true;
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

// ---- a division scored by criteria: one box per criterion on the same line
/** Every criterion has a value (a line with no criteria at all is not a criteria line). */
export function criteriaComplete(keys: string[], values: Record<string, number | undefined> | undefined): boolean {
  return keys.length > 0 && keys.every((k) => typeof values?.[k] === "number" && Number.isFinite(values[k]));
}

/** How many of the criteria have a value. */
export function criteriaFilled(keys: string[], values: Record<string, number | undefined> | undefined): number {
  return keys.filter((k) => typeof values?.[k] === "number" && Number.isFinite(values[k])).length;
}

/** The boxes after one of them was typed: the others stay as they were, so they can be filled in any order. */
export function mergeCriterion(values: Record<string, number> | undefined, key: string, value: number): Record<string, number> {
  return { ...(values ?? {}), [key]: value };
}

// ---- line by line: a score can only land on the first line of the rider that has no score yet
/** A line is done when it needs nothing more from this judge: it has their score (or Missed), it is greyed by a crash, or it holds their note (or Missed) ahead of the spotter. */
export function lineDone(line: SheetLine): boolean {
  if (line.kind === "crash") return true;
  if (line.kind === "attempt") return line.mine !== null;
  return line.pending !== null;
}

/** A logged attempt this judge has not scored yet: the line the sheet highlights, because it needs the judge's score (an empty line has no attempt to score, a crash needs none). */
export function needsScore(line: SheetLine): boolean {
  return line.kind === "attempt" && line.mine === null;
}

/** The line that pulses and glows: the first line without a score from this judge, when it is a logged attempt waiting for his score. Only one at a time; null otherwise. */
export function pulseLine(lines: SheetLine[]): number | null {
  const n = activeLine(lines);
  const line = n === null ? undefined : lines.find((l) => l.n === n);
  return line && needsScore(line) ? line.n : null;
}

/** What a tap on a line's Missed does: turn it on ("set"), or, when the line is already Missed, turn it off ("clear"). Typing a score on a Missed line turns it off by itself. */
export function missedSwitch(line: SheetLine): "set" | "clear" {
  return (line.kind === "attempt" && line.mine === "missed") || (line.kind === "empty" && line.pending === "missed") ? "clear" : "set";
}

/** The first line of the rider that is not done: the only one a new score can be typed on. Null when every line is done. */
export function activeLine(lines: SheetLine[]): number | null {
  return lines.find((l) => !lineDone(l))?.n ?? null;
}

/** May a score be typed on line n? The first line that is not done, and any line above it (a filled line can be changed until Submit); the lines below wait. */
export function lineTypable(lines: SheetLine[], n: number): boolean {
  const line = lines.find((l) => l.n === n);
  if (!line || !line.open) return false;
  const a = activeLine(lines);
  return a === null || n <= a;
}

/**
 * Tapping line n when it is below the first line without a score: the lines above that have no score from this judge, which one tap can mark Missed. Empty when line n
 * takes a score at once (it is the active line or above it).
 */
export function skipLines(lines: SheetLine[], n: number): number[] {
  const line = lines.find((l) => l.n === n);
  if (!line || !line.open || lineTypable(lines, n)) return [];
  return lines.filter((l) => l.n < n && !lineDone(l)).map((l) => l.n);
}

/** Line numbers as the question names them: "1–2", "1–3", "1–2 and 4", "2, 4 and 6". */
export function rangesOf(nums: number[]): string {
  const runs: string[] = [];
  for (let k = 0; k < nums.length; ) {
    let e = k;
    while (e + 1 < nums.length && nums[e + 1] === nums[e] + 1) e++;
    runs.push(e > k ? `${nums[k]}–${nums[e]}` : String(nums[k]));
    k = e + 1;
  }
  return runs.length <= 1 ? (runs[0] ?? "") : `${runs.slice(0, -1).join(", ")} and ${runs[runs.length - 1]}`;
}

// ---- the switch "Queue / Rider sheet": remembered per device (one choice for the whole phone, also on the head judge's Score tab), default Rider sheet.
// Only a phone whose user picked a view has a stored value; every other phone opens on the default.
export type JudgeView = "queue" | "sheet";
export const viewPreference = {
  key: "bigair.judgeView",
  read(storage: Pick<Storage, "getItem"> | null | undefined): JudgeView {
    try {
      return storage?.getItem(viewPreference.key) === "queue" ? "queue" : "sheet";
    } catch {
      return "sheet";
    }
  },
  write(view: JudgeView, storage: Pick<Storage, "setItem"> | null | undefined): void {
    try {
      storage?.setItem(viewPreference.key, view);
    } catch {
      /* private mode: the choice lasts until the page closes */
    }
  },
};
