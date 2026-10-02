import type { PublishBlocker } from "@/lib/engine/scoring";
import { sheetSubmitted } from "./sheet-state";
import type { ImpressionRow, ScoreRow, SheetRow } from "./types";

/** The reason the head judge's "Judge absent for this attempt" writes on a trick score. */
export const ABSENT_REASON = "Absent";

/** The head judge marked this judge Absent somewhere in the heat: a trick score (missed, reason "Absent") or an Impression / Variety score (missed). */
export function headMarkedAbsent(seatId: string, scores: Pick<ScoreRow, "judge_seat_id" | "missed" | "edit_reason">[], impressions: Pick<ImpressionRow, "judge_seat_id" | "missed">[]): boolean {
  return scores.some((s) => s.judge_seat_id === seatId && s.missed && s.edit_reason === ABSENT_REASON) || impressions.some((i) => i.judge_seat_id === seatId && i.missed);
}

/**
 * The panel judges whose sheet still holds Publish back (decision P2-1). A sheet that was submitted (and not re-opened since) is in. A sheet that was not counts
 * as submitted when nothing of that judge is missing any more AND the head judge has marked at least one of their scores Absent: the head judge has then
 * settled every gap of that judge. A judge who simply has not pressed Submit still holds Publish back (the head judge can publish past it with a reason).
 * The database applies the same rule (`private.unsubmitted_judges`).
 */
export function effectiveUnsubmitted(input: {
  panelSeatIds: string[];
  sheets: Pick<SheetRow, "judge_seat_id" | "submitted_at" | "reopened_at">[];
  blockers: PublishBlocker[];
  scores: Pick<ScoreRow, "judge_seat_id" | "missed" | "edit_reason">[];
  impressions: Pick<ImpressionRow, "judge_seat_id" | "missed">[];
}): string[] {
  return input.panelSeatIds.filter((id) => {
    if (sheetSubmitted(input.sheets.find((s) => s.judge_seat_id === id))) return false;
    const stillMissing = input.blockers.some((b) => (b.type === "score_missing" || b.type === "impression_missing") && b.judge === id);
    return stillMissing || !headMarkedAbsent(id, input.scores, input.impressions);
  });
}
