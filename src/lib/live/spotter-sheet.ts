import { composeTrick, normaliseText, parseTrickText, type TrickParts, type TrickVocab } from "@/lib/engine/tricks";
import { capitaliseName, splitCount } from "./trick-text";

/**
 * The spotter's Rider sheet. Pure: no I/O. One numbered line per attempt; a line logs itself (a tapped suggestion, a pause in the typing, or Crash), and every
 * later change to the line updates the same attempt. This file holds the rules; the screen (spotter-sheet.tsx) only draws them.
 *
 * Words: a LINE is a numbered row of one rider's sheet. Line n is the n-th attempt logged for the rider by anyone (deleted attempts do not count). The ACTIVE line is
 * the first empty one: the only line that takes typing. A line that is not the active one and not logged WAITS.
 */

/** With no attempt limit the sheet starts with this many lines; "Add attempt" adds one at a time. */
export const OPEN_LINES = 10;
/** How long the typing must be quiet before text that matches no suggestion counts as entered. */
export const PAUSE_MS = 5000;

/** How many lines a rider's sheet has: the limit (never fewer than the attempts logged); with no limit 10 plus the ones added. */
export function lineTotal(i: { logged: number; cap: number | null; added: number }): number {
  return Math.max(i.cap === null ? OPEN_LINES + Math.max(0, i.added) : i.cap, i.logged);
}

/** An attempt as the sheet needs it (from the attempts the phone has: the server's rows). */
export interface LoggedAttemptRow {
  id: string;
  seq: number;
  clientKey: string;
  status: "landed" | "crashed";
  trickName: string | null;
  direction: "left" | "right" | null;
  /** What was typed in the box (kept so a reload shows the box as it was). */
  rawText?: string | null;
  /** Logged by this spotter's seat (only those can be changed from here). */
  mine: boolean;
  deleted: boolean;
}

/** An attempt still waiting on the phone to be sent. */
export interface QueuedAttempt {
  clientKey: string;
  status: "landed" | "crashed";
  trickName: string | null;
  direction: "left" | "right" | null;
  rawText?: string | null;
}

export type SpotterLineState = "logged" | "saving" | "active" | "waiting";

export interface SpotterLine {
  n: number;
  state: SpotterLineState;
  /** May this seat change the attempt (trick, L / R, Crash)? Only the ones it logged. */
  editable: boolean;
  attemptId?: string;
  clientKey?: string;
  trickName: string | null;
  direction: "left" | "right" | null;
  rawText: string | null;
  crash: boolean;
}

/**
 * The lines of one rider's sheet. Logged attempts come first, in order of logging; then the ones still on the phone ("Saving…"); then the first empty line (active);
 * the rest wait. `changing` holds the client keys of attempts with a change still on its way: their line also reads "Saving…".
 */
export function spotterLines(i: { attempts: LoggedAttemptRow[]; queued: QueuedAttempt[]; cap: number | null; added: number; changing?: ReadonlySet<string> }): SpotterLine[] {
  const logged = i.attempts.filter((a) => !a.deleted).sort((a, b) => a.seq - b.seq);
  const known = new Set(logged.map((a) => a.clientKey));
  const queued = i.queued.filter((q) => !known.has(q.clientKey));
  const total = lineTotal({ logged: logged.length + queued.length, cap: i.cap, added: i.added });
  const out: SpotterLine[] = [];
  for (let n = 1; n <= total; n++) {
    const a = logged[n - 1];
    const q = queued[n - 1 - logged.length];
    if (a) {
      out.push({ n, state: i.changing?.has(a.clientKey) ? "saving" : "logged", editable: a.mine, attemptId: a.id, clientKey: a.clientKey, trickName: a.trickName, direction: a.direction, rawText: a.rawText ?? null, crash: a.status === "crashed" });
    } else if (q) {
      out.push({ n, state: "saving", editable: true, clientKey: q.clientKey, trickName: q.trickName, direction: q.direction, rawText: q.rawText ?? null, crash: q.status === "crashed" });
    } else {
      const first = n === logged.length + queued.length + 1;
      out.push({ n, state: first ? "active" : "waiting", editable: first, trickName: null, direction: null, rawText: null, crash: false });
    }
  }
  return out;
}

export type Direction = "left" | "right";

/** L and R are exclusive: tapping the other one switches. Tapping the one that is on keeps it on (an attempt never goes back to "no direction"). */
export function toggleDirection(_current: Direction | null, tapped: Direction): Direction {
  return tapped;
}

export type CommitDecision = { log: true; why: "picked" | "paused" | "crash" } | { log: false; waitMs: number | null };

/**
 * When does a line log itself (or, on a logged line, send its change)? As soon as Crash is on (a crash needs no trick); and for text that shows no suggestion, once the typing
 * has been quiet for about 5 seconds (a tapped suggestion only fills in the word and adds a space, so the typing goes on); leaving the box logs what is in it. Text whose
 * last word still shows suggestions waits for a tap or for the box to be left. Nothing at all
 * (no trick, no Crash) never logs: L or R alone is not an attempt. `waitMs` is how long to wait before asking again (null: nothing to wait for).
 */
export function commitDecision(i: { text: string; crash: boolean; picked: boolean; quietMs: number; hasOpenSuggestions: boolean }): CommitDecision {
  if (i.crash) return { log: true, why: "crash" };
  if (!i.text.trim()) return { log: false, waitMs: null };
  if (i.picked) return { log: true, why: "picked" };
  if (i.hasOpenSuggestions) return { log: false, waitMs: null };
  if (i.quietMs >= PAUSE_MS) return { log: true, why: "paused" };
  return { log: false, waitMs: PAUSE_MS - i.quietMs };
}

export interface ReadTrick {
  trickName: string | null;
  direction: Direction | null;
  categoryKey: string | null;
  trickParts: TrickParts;
  needsReview: boolean;
  rawText: string | null;
}

const isDirection = (d: string | null | undefined): d is Direction => d === "left" || d === "right";

/**
 * Typed words read the way both spotter views read them: a one- or two-digit count at the start is split off ("6 front rolls" → 6 and "front rolls"), and the rest is read
 * with the vocabulary. A count goes with a plural but the vocabulary is singular: when the words as typed leave something unrecognised, they are tried in the singular.
 */
export function parseTyped(vocab: TrickVocab, enabledIds: ReadonlySet<string>, text: string): { count: number | null; parsed: ReturnType<typeof parseTrickText> } {
  const { count, rest } = splitCount(text.trim());
  let parsed = parseTrickText(vocab, rest, enabledIds);
  if (count && parsed.parts.freeText?.trim()) {
    const singular = parseTrickText(vocab, rest.replace(/\b([A-Za-z]{3,})s\b/g, "$1"), enabledIds);
    if (!singular.parts.freeText?.trim() && singular.parts.items.length > 0) parsed = singular;
  }
  return { count, parsed };
}

/**
 * What a line's box and its L / R buttons say, read the way the Trick list reads typed text (the same vocabulary matching). A button wins over a direction word typed
 * in the box. Words that match nothing stay free text and are flagged for the head judge.
 */
export function readTrick(vocab: TrickVocab, enabledIds: ReadonlySet<string>, text: string, button: Direction | null): ReadTrick {
  const t = text.trim();
  if (!t) return { trickName: null, direction: button, categoryKey: null, trickParts: { direction: button, items: [] }, needsReview: false, rawText: null };
  const { count, parsed: r } = parseTyped(vocab, enabledIds, t);
  const direction = button ?? (isDirection(r.parts.direction) ? r.parts.direction : null);
  const needsReview = Boolean(r.parts.freeText?.trim()) || r.needsReview;
  const parts: TrickParts = { ...r.parts, direction, ...(count ? { count } : {}), ...(needsReview ? { needsReview: true } : {}) };
  const composed = composeTrick(vocab, parts);
  return { trickName: composed.name ? capitaliseName(composed.name) : null, direction, categoryKey: composed.categoryKey, trickParts: parts, needsReview, rawText: t };
}

export interface Suggestion {
  id: string;
  label: string;
  /** How many of the typed words the suggestion replaces. */
  replace: number;
  /** It is exactly what has been typed, spelled the same (ignoring capitals): so nothing is left to choose. "board off" and "boardoff" are not exact for Board-off: it is offered. */
  exact: boolean;
}

const squash = (s: string) => s.replace(/ /g, "");

/** The blocks that start like the last words typed (a name or a nickname), best first. Directions are buttons, so they are never offered. */
export function suggestionsFor(vocab: TrickVocab, enabledIds: ReadonlySet<string>, text: string, limit = 6): Suggestion[] {
  if (!text.trim() || /\s$/.test(text)) return [];
  const words = text.trim().split(/\s+/);
  const blocks = vocab.blocks.filter((b) => b.family !== "direction" && enabledIds.has(b.id));
  for (let k = Math.min(3, words.length); k >= 1; k--) {
    const phrase = normaliseText(words.slice(-k).join(" "));
    if (!phrase) continue;
    const hits: Array<{ b: (typeof blocks)[number]; rank: number }> = [];
    for (const b of blocks) {
      const label = normaliseText(b.label);
      const nick = b.aliases.map(normaliseText);
      let rank = -1;
      if (label.startsWith(phrase)) rank = 0;
      else if (phrase.length >= 2 && nick.some((n) => n.startsWith(phrase))) rank = 1;
      else if (k === 1 && label.split(" ").some((w) => w.startsWith(phrase))) rank = 2;
      if (rank >= 0) hits.push({ b, rank });
    }
    // a word in the middle of a name only counts when nothing starts like what was typed
    const best = Math.min(...hits.map((h) => h.rank), 9);
    if (best <= 1) hits.splice(0, hits.length, ...hits.filter((h) => h.rank <= 1));
    if (!hits.length) continue;
    hits.sort((a, b) => a.rank - b.rank || a.b.label.length - b.b.label.length);
    return hits.slice(0, limit).map(({ b }) => ({ id: b.id, label: b.label, replace: k, exact: words.slice(-k).join(" ").toLowerCase() === b.label.toLowerCase() }));
  }
  return [];
}

/** The box after a suggestion is tapped: the words it replaces are swapped for its name. */
export function applySuggestion(text: string, s: Suggestion): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return [...words.slice(0, Math.max(0, words.length - s.replace)), s.label].join(" ");
}

// ---- the switch "Rider sheet / Trick list": remembered per phone, default Rider sheet. Only a phone whose user picked the Trick list has a stored value.
export type SpotterView = "sheet" | "list";
export const spotterViewPreference = {
  key: "bigair.spotterView",
  read(storage: Pick<Storage, "getItem"> | null | undefined): SpotterView {
    try {
      return storage?.getItem(spotterViewPreference.key) === "list" ? "list" : "sheet";
    } catch {
      return "sheet";
    }
  },
  write(view: SpotterView, storage: Pick<Storage, "setItem"> | null | undefined): void {
    try {
      storage?.setItem(spotterViewPreference.key, view);
    } catch {
      /* private mode: the choice lasts until the page closes */
    }
  },
};
