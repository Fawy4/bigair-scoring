import type { Attempt, HeatInput, JudgeMark, Modifier, RiderInput, TieDecision } from "@/lib/engine/scoring";
import type { ScoringModel } from "@/lib/schemas/scoring-model";
import type { AttemptRow, ImpressionRow, ScoreRow, SlotRow } from "./types";

export interface PenaltyRow {
  heat_id: string;
  entry_id: string;
  type: string;
  reason: string | null;
}

/** A judge's answer on one attempt as the engine reads it: a score or the criteria values, "missed", or nothing yet. */
export function markOf(model: ScoringModel, s: ScoreRow | undefined): JudgeMark["value"] | undefined {
  if (!s) return undefined;
  if (s.missed) return "missed";
  if (model.trick.entry === "criteria") return s.criteria && typeof s.criteria === "object" && Object.keys(s.criteria as object).length ? (s.criteria as Record<string, number>) : undefined;
  return s.score === null ? undefined : Number(s.score);
}

/**
 * The stored rows of one heat as the scoring engine reads them (docs/PLAN-phase-5 step 5, point 2). The head console, the totals and Publish all
 * call this, so a number on the screen and the published number cannot differ.
 */
export function heatInputFromRows(
  model: ScoringModel,
  panelSeatIds: string[],
  slots: SlotRow[],
  attempts: AttemptRow[],
  scores: ScoreRow[],
  impressions: ImpressionRow[],
  penalties: PenaltyRow[] = [],
  decisions: TieDecision[] = [],
): HeatInput {
  const panel = new Set(panelSeatIds);
  const riders: RiderInput[] = slots
    .filter((s) => s.entry_id)
    .map((s) => {
      const mine = attempts.filter((a) => a.entry_id === s.entry_id && !a.deleted_at).sort((a, b) => a.seq - b.seq);
      const engineAttempts: Attempt[] = mine.map((a) => ({
        seq: a.seq,
        status: a.status,
        trickName: a.trick_name,
        categoryKey: a.category_key,
        direction: a.direction,
        createdAt: a.created_at,
        createdBy: a.created_by_seat,
        marks: scores
          .filter((x) => x.attempt_id === a.id && panel.has(x.judge_seat_id))
          .flatMap((x): JudgeMark[] => {
            const value = markOf(model, x);
            return value === undefined ? [] : [{ judgeId: x.judge_seat_id, value }];
          }),
      }));
      const modifiers: Modifier[] = [
        ...(s.modifier === "DNS" || s.modifier === "DNF" || s.modifier === "DSQ" ? [{ type: s.modifier } as Modifier] : []),
        ...penalties.filter((p) => p.entry_id === s.entry_id && p.type === "INT").map((p): Modifier => ({ type: "INT", ...(p.reason ? { reason: p.reason } : {}) })),
      ];
      return {
        riderId: s.entry_id!,
        attempts: engineAttempts,
        impressionMarks: impressions.filter((i) => i.entry_id === s.entry_id && panel.has(i.judge_seat_id)).map((i) => ({ judgeId: i.judge_seat_id, value: Number(i.value) })),
        ...(modifiers.length ? { modifiers } : {}),
      };
    });
  return { panelJudgeIds: panelSeatIds, riders, ...(decisions.length ? { headJudgeDecisions: decisions } : {}) };
}
