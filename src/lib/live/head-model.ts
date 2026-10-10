import { computeHeat, type Attempt, type HeatResult, type TieDecision } from "@/lib/engine/scoring";
import { flagOutCandidates, type FlagOutCandidates } from "@/lib/engine/scoring/flag-out";
import type { LabelModel } from "@/lib/identification/rider-label";
import type { ScoringModel } from "@/lib/schemas/scoring-model";
import { agreementReport, type JudgeAgreement } from "./agreement";
import { riderTotals, type RiderTotal } from "./head-totals";
import { judgeWordFor } from "./judge-names";
import { heatInputFromRows, type PenaltyRow } from "./heat-input";
import { buildMatrix, type LiveMatrix } from "./matrix";
import { pendingBlockers, publishChecklist, type Checklist } from "./publish-checklist";
import { effectiveUnsubmitted } from "./sheet-rule";
import { tieSentences, type TieSentence } from "./tie-words";
import type { AttemptRow, FlagRow, ImpressionRow, PendingRow, ScoreRow, SheetRow, SlotRow } from "./types";
import { copy } from "@/lib/ui-copy";
import { impressionNameOf } from "@/lib/schemas/impression-name";

export interface HeadModel {
  /** The engine's result on what is scored so far; null if the rows could not be scored (the console then says so). */
  result: HeatResult | null;
  error: string | null;
  totals: RiderTotal[];
  matrix: LiveMatrix;
  checklist: Checklist;
  ties: TieSentence[];
  /** Impression / Variety scores still owed, in words. */
  owes: Array<{ seatId: string; judgeNo: number; /** The judge as a word: the seat's name. */ judge: string; entryId: string }>;
  /** Panel judges whose sheet still holds Publish back (not submitted, and not settled by the head judge's Absent marks: decision P2-1). */
  unsubmitted: string[];
  agreement: JudgeAgreement[];
  flagOut: FlagOutCandidates | null;
}

export { sheetSubmitted } from "./sheet-state";

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
  /** The judge as a word in sentences ("Fawy"); the tag ("J1") when it is not given. */
  judgeWord?: (seatId: string) => string;
  /** The rider as a word in sentences ("Red", "Sam Rivera"). */
  wordFor: (entryId: string) => string;
  showPercent?: boolean;
  flagOutCount?: number;
  /** Scores judges typed on the Rider sheet that have no attempt yet: shown as pending rows, hold Publish back, never counted. */
  pending?: PendingRow[];
  /** The rider's name for the Publish blocker ("Omar Hassan: J3 has a score with no attempt"); the rider's word when not given. */
  nameFor?: (entryId: string) => string;
  /** The riders in seat order (pending rows follow it). */
  riderOrder?: string[];
}): HeadModel {
  const { model, panelSeatIds } = input;
  const matrix = buildMatrix({ model, panelSeatIds, attempts: input.attempts, scores: input.scores, flags: input.flags, labelFor: input.labelFor, pending: input.pending, riderOrder: input.riderOrder });
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
  const judgeWord = input.judgeWord ?? judgeWordFor(panelSeatIds, {});
  const unsubmitted = effectiveUnsubmitted({ panelSeatIds, sheets: input.sheets, blockers: result?.publishBlockers ?? [], scores: input.scores, impressions: input.impressions });
  const checklist = publishChecklist({
    blockers: result?.publishBlockers ?? [],
    unsubmitted,
    judgeWord,
    attemptIdOf: (rider, seq) => input.attempts.find((a) => a.entry_id === rider && a.seq === seq && !a.deleted_at)?.id,
    riderLabel: input.wordFor,
    impressionLabel: copy.checklist.impressionWord(impressionNameOf(model)),
    pending: pendingBlockers(input.pending ?? [], panelSeatIds),
    riderName: input.nameFor,
    judgeTag: (id) => copy.live.matrix.judgeTag((panelSeatIds.indexOf(id) < 0 ? 0 : panelSeatIds.indexOf(id)) + 1),
  });
  const decisions = input.decisions;
  // a heat nobody has ridden has no ties yet: two riders with no score are not "tied"
  const anyScore = Boolean(result?.riders.some((r) => r.allAttempts.length > 0 || (r.impression?.judgeScores.length ?? 0) > 0));
  const ties = result && anyScore ? tieSentences(model, result, input.wordFor, decisions) : [];
  const owes = (result?.publishBlockers ?? []).flatMap((b) => (b.type === "impression_missing" ? [{ seatId: b.judge, judgeNo: seatNo.get(b.judge) ?? 0, judge: judgeWord(b.judge), entryId: b.rider }] : []));
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
