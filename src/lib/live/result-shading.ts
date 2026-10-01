import { copy } from "@/lib/ui-copy";

/** What a score box in the public heat summary shows: a division setting. Arrow's default is attempt number + score. */
export type AttemptDisplay = "number_score" | "trick_score" | "scores_only";
export const ATTEMPT_DISPLAYS: AttemptDisplay[] = ["number_score", "trick_score", "scores_only"];
export const DEFAULT_ATTEMPT_DISPLAY: AttemptDisplay = "number_score";

export const GRADE_STEPS = 5;

/**
 * Grade of a counted score ACROSS THE HEAT (not within the rider): 0 is the yellowest (the lowest counted score in the heat) and `steps - 1` the greenest
 * (the highest counted score in the heat). When every counted score is equal the box is the greenest.
 */
export function gradeIndex(score: number, min: number, max: number, steps: number = GRADE_STEPS): number {
  if (max - min < 1e-9) return steps - 1;
  return Math.max(0, Math.min(steps - 1, Math.round(((score - min) / (max - min)) * (steps - 1))));
}

export type BoxTone = { kind: "crash" } | { kind: "notCounted" } | { kind: "counted"; grade: number };

/** Crash red, not counted grey, counted graded yellow to green across the heat. `heatCounted` is every counted score of the heat. */
export function boxTone(box: { status: "landed" | "crashed"; counted: boolean; score: number | null }, heatCounted: number[]): BoxTone {
  if (box.status === "crashed") return { kind: "crash" };
  if (!box.counted || box.score === null) return { kind: "notCounted" };
  return { kind: "counted", grade: gradeIndex(box.score, Math.min(...heatCounted), Math.max(...heatCounted)) };
}

/** The words in one score box for a display setting. A crash says CRASH and never shows a score. */
export function boxText(a: { seq: number; trick: string; scoreLabel: string | null; status: "landed" | "crashed" }, mode: AttemptDisplay): string {
  const value = a.status === "crashed" ? copy.live.result.crash : (a.scoreLabel ?? "");
  if (mode === "scores_only") return value;
  return `${mode === "number_score" ? a.seq : a.trick} · ${value}`;
}
