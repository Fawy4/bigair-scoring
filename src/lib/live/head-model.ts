import { computeHeat, type Attempt, type HeatResult, type TieDecision } from "@/lib/engine/scoring";
import { flagOutCandidates, type FlagOutCandidates } from "@/lib/engine/scoring/flag-out";
import type { LabelModel } from "@/lib/identification/rider-label";
import type { ScoringModel } from "@/lib/schemas/scoring-model";
import { agreementReport, type JudgeAgreement } from "./agreement";
import { riderTotals, type RiderTotal } from "./head-totals";
import { heatInputFromRows, type PenaltyRow } from "./heat-input";
import { buildMatrix, type LiveMatrix } from "./matrix";
import { publishChecklist, type Checklist } from "./publish-checklist";
import { tieSentences, type TieSentence } from "./tie-words";
import type { AttemptRow, FlagRow, ImpressionRow, ScoreRow, SheetRow, SlotRow } from "./types";
import { copy } from "@/lib/ui-copy";

export interface HeadModel {
  /** The engine's result on what is scored so far; null if the rows could not be scored (the console then says so). */
  result: HeatResult | null;
  error: string | null;
  totals: RiderTotal[];
  matrix: LiveMatrix;
  checklist: Checklist;
  ties: TieSentence[];
  /** Impression / Variety scores still owed, in words. */
  owes: Array<{ seatId: string; judgeNo: number; entryId: string }>;
  /** Panel judges who have not submitted their sheet. */
  unsubmitted: string[];
  agreement: JudgeAgreement[];
  flagOut: FlagOutCandidates | null;
}

/** A sheet counts as submitted when it was submitted and not re-opened since. */
export const sheetSubmitted = (s: Pick<SheetRow, "submitted_at" | "reopened_at"> | undefined): boolean => Boolean(s?.submitted_at && (!s.reopened_at || s.submitted_at > s.reopened_at));

/**
 * Everything the head judge's console shows about one heat, from the stored rows: the score table, the rider totals (the same engine the published result
 * uses), what blocks Publish in words, who is tied, who owes an Impression / Variety score, the agreement report, and the flag-out candidates.
 */
export function buildHeadModel(input: {
  model: ScoringModel;
  panelSeatIds: string[];
  slots: SlotRow[];
  attempts: AttemptRow[];
  scores: ScoreRow[];
  impressions: ImpressionRow[];
  penalties: PenaltyRow[];
  decisions: TieDecision[];
  flags: FlagRow[];
  sheets: SheetRow[];
  labelFor: (entryId: string) => LabelModel;
  /** The rider as a word in sentences ("Red", "Sam Rivera"). */
  wordFor: (entryId: string) => string;
  showPercent?: boolean;
  flagOutCount?: number;
}): HeadModel {
  const { model, panelSeatIds } = input;
  const matrix = buildMatrix({ model, panelSeatIds, attempts: input.attempts, scores: input.scores, flags: input.flags, labelFor: input.labelFor });
  const totals = riderTotals(model, panelSeatIds, input.slots, input.attempts, input.scores, input.impressions, input.showPercent ?? false, input.penalties, input.decisions);
  const heatInput = heatInputFromRows(model, panelSeatIds, input.slots, input.attempts, input.scores, input.impressions, input.penalties, input.decisions);
  let result: HeatResult | null = null;
  let error: string | null = null;
  try {
    result = computeHeat(model, heatInput);
  } catch (e) {
    error = e instanceof Error ? e.message : copy.liveErrors.unknown;
  }
  const seatNo = new Map(panelSeatIds.map((id, i) => [id, i + 1] as const));
  const unsubmitted = panelSeatIds.filter((id) => !sheetSubmitted(input.sheets.find((s) => s.judge_seat_id === id)));
  const checklist = publishChecklist({
    blockers: result?.publishBlockers ?? [],
    unsubmitted,
    judgeNumber: (id) => seatNo.get(id) ?? 0,
    riderLabel: input.wordFor,
    impressionLabel: copy.checklist.impressionWord,
  });
  const decisions = input.decisions;
  const ties = result ? tieSentences(model, result, input.wordFor, decisions) : [];
  const owes = (result?.publishBlockers ?? []).flatMap((b) => (b.type === "impression_missing" ? [{ seatId: b.judge, judgeNo: seatNo.get(b.judge) ?? 0, entryId: b.rider }] : []));
  const engineAttempts: Attempt[] = heatInput.riders.flatMap((r) => r.attempts);
  const agreement = agreementReport(model, panelSeatIds, engineAttempts);
  const flagOut = input.flagOutCount && input.flagOutCount > 0 ? safeFlagOut(model, heatInput, input.flagOutCount) : null;
  return { result, error, totals, matrix, checklist, ties, owes, unsubmitted, agreement, flagOut };
}

function safeFlagOut(model: ScoringModel, heat: Parameters<typeof flagOutCandidates>[1], count: number): FlagOutCandidates | null {
  try {
    return flagOutCandidates(model, heat, count);
  } catch {
    return null;
  }
}
