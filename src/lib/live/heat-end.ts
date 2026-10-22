import type { AttemptRow, FlagRow } from "./types";

/**
 * HE1 — the end of a heat. Pure rules, no screens: who is still working after the clock reached 0 or End heat was pressed, which flags are open, and what Publish
 * should ask about. The clock reaching 0 never takes an official off his screen and never locks it; the head judge sees who is still at work and publishes when ready.
 */

/** "Spotter still logging": a spotter logged a line this recently (or the heat ended this recently and a spotter's phone is connected). */
export const SPOTTER_QUIET_MS = 45_000;

/** When the heat's time ran out or End heat was pressed (epoch ms), or null. */
export function heatEndedAtMs(h: { ended_at: string | null; started_at: string | null; duration_sec: number; paused_total_sec: number }): number | null {
  if (h.ended_at) return Date.parse(h.ended_at);
  if (h.started_at) return Date.parse(h.started_at) + (h.duration_sec + h.paused_total_sec) * 1000;
  return null;
}

/**
 * Is a spotter still logging? Yes when a spotter logged a line of this heat within the last 45 seconds, or when the heat ended less than 45 seconds ago and
 * a spotter's phone was seen lately (the last jumps are logged after the horn). Otherwise no: the head judge can publish. (A correction does not count: the head judge's own
 * edits change the same lines, and a corrected line is not a missing one.)
 */
export function spotterStillLogging(i: { endedAtMs: number | null; nowMs: number; attempts: Array<Pick<AttemptRow, "created_at">>; spotterSeenMsAgo: Array<number | null>; seenWithinMs: number }): boolean {
  const recent = i.attempts.some((a) => i.nowMs - Date.parse(a.created_at) <= SPOTTER_QUIET_MS);
  if (recent) return true;
  const justEnded = i.endedAtMs !== null && i.nowMs - i.endedAtMs <= SPOTTER_QUIET_MS;
  return justEnded && i.spotterSeenMsAgo.some((ago) => ago !== null && ago <= i.seenWithinMs);
}

export interface OpenFlag {
  id: string;
  attemptId: string;
  judgeId: string;
  kind: string;
  note: string | null;
  /** When the judge raised it (epoch ms). */
  at: number;
}

/** The judges' flags that nobody has resolved yet, oldest first. A flag about an attempt that is gone (taken out) is not open any more. */
export function openFlagsOf(flags: FlagRow[], attempts: Array<Pick<AttemptRow, "id" | "deleted_at">>, heatId: string): OpenFlag[] {
  const alive = new Set(attempts.filter((a) => !a.deleted_at).map((a) => a.id));
  return flags
    .filter((f) => f.heat_id === heatId && !f.resolved_at && alive.has(f.attempt_id))
    .map((f) => ({ id: f.id, attemptId: f.attempt_id, judgeId: f.judge_seat_id, kind: f.kind, note: f.note?.trim() ? f.note.trim() : null, at: Date.parse(f.created_at) }))
    .sort((a, b) => a.at - b.at);
}

export interface JudgeLines {
  seatId: string;
  /** Landed lines this judge has not scored. */
  lines: number;
}

/**
 * Who still has lines to score: for each judge of the panel, the landed lines of riders who ride that have no score from him (a score and a Missed both count as done),
 * in the panel's order. Counted from the attempts and the scores themselves, not from the Publish blockers (those list missing scores only when the division requires every judge).
 */
export function judgesWithLines(i: {
  panelSeatIds: string[];
  attempts: Array<Pick<AttemptRow, "id" | "entry_id" | "status" | "deleted_at">>;
  scores: Array<{ attempt_id: string; judge_seat_id: string }>;
  /** Riders who do not ride in this heat (did not start, disqualified) owe no scores. */
  notRiding?: ReadonlySet<string>;
}): JudgeLines[] {
  const scored = new Set(i.scores.map((s) => `${s.judge_seat_id}|${s.attempt_id}`));
  const lines = i.attempts.filter((a) => a.status === "landed" && !a.deleted_at && !i.notRiding?.has(a.entry_id));
  return i.panelSeatIds
    .map((seatId) => ({ seatId, lines: lines.filter((a) => !scored.has(`${seatId}|${a.id}`)).length }))
    .filter((j) => j.lines > 0);
}

/** Everything the head judge should know is still open once the heat has ended. */
export interface OpenWork {
  spotter: boolean;
  judges: JudgeLines[];
  flags: OpenFlag[];
}

export const openWorkCount = (w: OpenWork): number => (w.spotter ? 1 : 0) + w.judges.length + w.flags.length;
export const noOpenWork: OpenWork = { spotter: false, judges: [], flags: [] };

/** Publish asks once while anything is open, never blocks: the sentences it shows ("Spotter still logging", "Judge 2: 1 line to score", "1 open flag"). */
export function openWorkParts(w: OpenWork, words: { spotter: string; judge: (seatId: string, lines: number) => string; flags: (n: number) => string }): string[] {
  return [...(w.spotter ? [words.spotter] : []), ...w.judges.map((j) => words.judge(j.seatId, j.lines)), ...(w.flags.length ? [words.flags(w.flags.length)] : [])];
}

/**
 * The lines on a judge's sheet that came after he submitted: a line logged after Submit is "New attempt to score". `submittedAt` is the judge's last Submit (ms).
 * Only a landed line with no score from this judge counts.
 */
export function newAttemptIds(i: { attempts: Array<Pick<AttemptRow, "id" | "status" | "created_at" | "deleted_at">>; submittedAtMs: number | null; scoredIds: ReadonlySet<string> }): Set<string> {
  const out = new Set<string>();
  if (i.submittedAtMs === null) return out;
  for (const a of i.attempts) if (a.status === "landed" && !a.deleted_at && Date.parse(a.created_at) > i.submittedAtMs && !i.scoredIds.has(a.id)) out.add(a.id);
  return out;
}

/** Does the late line count against a judge who submitted before it was logged? (Used by the screens to say "your sheet is open again".) */
export function sheetReopenedByNewAttempt(sheet: { submitted_at: string | null; reopened_at: string | null } | undefined): boolean {
  return Boolean(sheet?.submitted_at && sheet.reopened_at && Date.parse(sheet.reopened_at) >= Date.parse(sheet.submitted_at));
}
