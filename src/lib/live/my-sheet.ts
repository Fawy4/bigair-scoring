import { computeHeat, type Attempt } from "@/lib/engine/scoring";
import type { ScoringModel } from "@/lib/schemas/scoring-model";

export interface MyScoreEntry {
  score: number | null;
  missed: boolean;
  criteria: Record<string, number> | null;
}

export interface SheetAttempt {
  id: string;
  seq: number;
  status: "landed" | "crashed";
  trickName: string | null;
  categoryKey: string | null;
  direction: "left" | "right" | null;
}

/**
 * Which of a rider's tricks count, seen from this judge's own scores only (a judge never sees the others'): the model's own counting rules
 * (best 3, per category …) run on a panel of one. Wrapped so a half-filled or odd sheet shows nothing counted instead of failing.
 */
export function myCountedSeqs(model: ScoringModel, attempts: SheetAttempt[], mine: Record<string, MyScoreEntry | undefined>, seatId: string): Set<number> {
  try {
    const engineAttempts: Attempt[] = attempts.map((a) => {
      const m = mine[a.id];
      const marks = !m ? [] : m.missed ? [{ judgeId: seatId, value: "missed" as const }] : model.trick.entry === "criteria" && m.criteria ? [{ judgeId: seatId, value: m.criteria }] : m.score !== null ? [{ judgeId: seatId, value: m.score }] : [];
      return { seq: a.seq, status: a.status, trickName: a.trickName, categoryKey: a.categoryKey, direction: a.direction, marks };
    });
    const result = computeHeat(model, { panelJudgeIds: [seatId], riders: [{ riderId: "me", attempts: engineAttempts }] });
    return new Set(result.riders[0].counted.map((c) => c.attemptSeq));
  } catch {
    return new Set();
  }
}
