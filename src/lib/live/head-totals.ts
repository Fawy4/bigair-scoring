import { computeHeat, type Attempt, type HeatResult, type JudgeMark, type RiderInput } from "@/lib/engine/scoring";
import { roundHalfUp } from "@/lib/engine/scoring";
import type { ScoringModel } from "@/lib/schemas/scoring-model";
import { copy } from "@/lib/ui-copy";
import type { AttemptRow, ImpressionRow, ScoreRow, SlotRow } from "./types";

export interface RiderTotal {
  entryId: string;
  place: number | null;
  /** "31.54", or "—" for a rider who did not start. */
  totalLabel: string;
  /** "31.54 = tricks 24.04 + Impression 7.50", or null while nothing is scored. */
  formula: string | null;
  percentLabel: string | null;
  attempts: number;
  cap: number | null;
  /** Something a judge still owes, so the number can still change. */
  incomplete: boolean;
}

const two = (n: number) => roundHalfUp(n, 2).toFixed(2);

/**
 * The rider totals as they come in, for the head judge (docs/PLAN-phase-5 step 1): the real engine on whatever is scored so far, ranked provisionally.
 * Judges' scores arrive as the head seat reads them (every judge's); an attempt without enough scores simply has no panel score yet.
 */
export function riderTotals(
  model: ScoringModel,
  panelSeatIds: string[],
  slots: SlotRow[],
  attempts: AttemptRow[],
  scores: ScoreRow[],
  impressions: ImpressionRow[],
  showPercent = false,
): RiderTotal[] {
  const riding = slots.filter((s) => s.entry_id);
  const inputs: RiderInput[] = riding.map((s) => {
    const mine = attempts.filter((a) => a.entry_id === s.entry_id && !a.deleted_at).sort((a, b) => a.seq - b.seq);
    const engineAttempts: Attempt[] = mine.map((a) => {
      const marks: JudgeMark[] = scores
        .filter((x) => x.attempt_id === a.id && panelSeatIds.includes(x.judge_seat_id))
        .flatMap((x): JudgeMark[] => {
          if (x.missed) return [{ judgeId: x.judge_seat_id, value: "missed" }];
          if (model.trick.entry === "criteria") return x.criteria && typeof x.criteria === "object" && Object.keys(x.criteria as object).length ? [{ judgeId: x.judge_seat_id, value: x.criteria as Record<string, number> }] : [];
          return x.score === null ? [] : [{ judgeId: x.judge_seat_id, value: Number(x.score) }];
        });
      return { seq: a.seq, status: a.status, trickName: a.trick_name, categoryKey: a.category_key, direction: a.direction, marks };
    });
    return {
      riderId: s.entry_id!,
      attempts: engineAttempts,
      impressionMarks: impressions.filter((i) => i.entry_id === s.entry_id && panelSeatIds.includes(i.judge_seat_id)).map((i) => ({ judgeId: i.judge_seat_id, value: Number(i.value) })),
      ...(s.modifier === "DNS" || s.modifier === "DNF" || s.modifier === "DSQ" ? { modifiers: [{ type: s.modifier }] } : {}),
    };
  });
  let result: HeatResult;
  try {
    result = computeHeat(model, { panelJudgeIds: panelSeatIds, riders: inputs });
  } catch {
    return riding.map((s) => ({ entryId: s.entry_id!, place: null, totalLabel: copy.live.result.noTotal, formula: null, percentLabel: null, attempts: 0, cap: model.heat.maxAttemptsPerRider, incomplete: true }));
  }
  const label = model.heat.impression?.label ?? "";
  return result.riders
    .map((r) => {
      const dns = r.status === "DNS" || r.status === "DSQ";
      const scored = r.allAttempts.some((a) => (a.panel?.judgeScores.length ?? 0) > 0) || (r.impression?.judgeScores.length ?? 0) > 0;
      return {
        entryId: r.riderId,
        place: result.ranking.find((x) => x.riderId === r.riderId)?.place ?? null,
        totalLabel: dns ? copy.live.result.noTotal : r.totalLabel,
        formula: dns || !scored ? null : copy.live.result.formula(r.totalLabel, two(r.components.tricks), label, two(r.components.impression)),
        percentLabel: showPercent && !dns && scored && r.percent !== null ? copy.live.result.percent(two(r.percent)) : null,
        attempts: r.attemptCount,
        cap: r.attemptCap,
        incomplete: r.flags.incomplete || result.publishBlockers.some((b) => "rider" in b && b.rider === r.riderId),
      };
    })
    .sort((a, b) => (a.place ?? 999) - (b.place ?? 999));
}
