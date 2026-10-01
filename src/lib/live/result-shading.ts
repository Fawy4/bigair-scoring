import { copy } from "@/lib/ui-copy";

/** What spectators see per attempt: a division setting ("What spectators see per attempt"). */
export type AttemptDisplay = "trick_score" | "number_score" | "scores_only";
export const ATTEMPT_DISPLAYS: AttemptDisplay[] = ["trick_score", "number_score", "scores_only"];

/** Index of the green shade of a counted trick: 0 is the darkest (the highest counted trick), `steps - 1` the lightest (the lowest counted one). */
export function shadeIndex(rank: number, counted: number, steps: number): number {
  if (counted <= 1) return 0;
  return Math.max(0, Math.min(steps - 1, Math.round((rank / (counted - 1)) * (steps - 1))));
}

export const SHADE_STEPS = 4;

export type AttemptTone = { kind: "crash" } | { kind: "notCounted" } | { kind: "counted"; shade: number };

export interface ToneRow {
  seq: number;
  status: "landed" | "crashed";
  counted: boolean;
  score: number | null;
}

/** Crash red, not counted grey, counted green shaded by score among the counted tricks of the same rider. */
export function attemptTone(row: ToneRow, all: ToneRow[]): AttemptTone {
  if (row.status === "crashed") return { kind: "crash" };
  if (!row.counted) return { kind: "notCounted" };
  const counted = all.filter((r) => r.counted && r.status === "landed").sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.seq - b.seq);
  const rank = counted.findIndex((r) => r.seq === row.seq);
  return { kind: "counted", shade: shadeIndex(Math.max(rank, 0), counted.length, SHADE_STEPS) };
}

/** The words of one attempt line for a display setting. A crash never shows a score. */
export function attemptLabel(a: { seq: number; trick: string; scoreLabel: string | null; status: "landed" | "crashed" }, mode: AttemptDisplay): { left: string; right: string } {
  const right = a.status === "crashed" ? "" : (a.scoreLabel ?? "");
  if (mode === "scores_only") return { left: "", right };
  if (mode === "number_score") return { left: copy.live.attempt.number(a.seq), right };
  return { left: copy.live.result.attemptLine(a.seq, a.trick), right };
}
