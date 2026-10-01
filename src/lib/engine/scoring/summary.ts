import { normaliseTrickName } from "./attempts";

/** One of a rider's logged attempts (deleted ones are left out by the caller). */
export interface SummaryAttempt {
  id: string;
  seq: number;
  status: "landed" | "crashed";
  trickName: string | null;
  direction: "left" | "right" | null;
}

/** The judge's own score for an attempt: a number, "missed", or null when not scored. */
export type MyScore = number | "missed" | null | undefined;

export interface SummaryTrick {
  seq: number;
  trick: string;
  direction: "left" | "right" | null;
  /** The judge's own score; null when missed or not scored. */
  score: number | null;
  scoreLabel: string;
}

/** The compact heat-end card (docs/08 §1G-9): counts, left and right, repeats, and the landed tricks with the judge's own scores. No families, no rotation analysis. */
export interface HeatSummary {
  attempts: number;
  landed: number;
  crashed: number;
  repeats: number;
  left: number;
  right: number;
  landedList: SummaryTrick[];
}

/** `label` writes a score ("7.625"); `missedLabel` is shown for a Missed or unscored attempt. */
export function heatSummary(attempts: SummaryAttempt[], myScores: Record<string, MyScore>, label: (n: number) => string, missedLabel = "—"): HeatSummary {
  const ordered = [...attempts].sort((a, b) => a.seq - b.seq);
  const landed = ordered.filter((a) => a.status === "landed");
  const seen = new Set<string>();
  let repeats = 0;
  for (const a of landed) {
    const key = normaliseTrickName(a.trickName);
    if (key === null) continue;
    if (seen.has(key)) repeats++;
    seen.add(key);
  }
  const list: SummaryTrick[] = landed
    .map((a) => {
      const mine = myScores[a.id];
      const score = typeof mine === "number" ? mine : null;
      return { seq: a.seq, trick: a.trickName ?? "", direction: a.direction, score, scoreLabel: score === null ? missedLabel : label(score) };
    })
    .sort((x, y) => (y.score ?? -1) - (x.score ?? -1) || x.seq - y.seq);
  return {
    attempts: ordered.length,
    landed: landed.length,
    crashed: ordered.length - landed.length,
    repeats,
    left: landed.filter((a) => a.direction === "left").length,
    right: landed.filter((a) => a.direction === "right").length,
    landedList: list,
  };
}
