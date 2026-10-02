import { formatCell } from "./matrix-model";
import { copy } from "@/lib/ui-copy";

const T = copy.audit;

export interface AuditRow {
  id: string;
  action: string;
  reason: string | null;
  at: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface AuditWords {
  /** Judge seat id → the judge as a word (the seat's name, "Fawy"). */
  judgeWord: (seatId: string) => string;
  riderWord: (entryId: string) => string;
  /** "Red 3": the rider and the attempt number. */
  attemptWord: (attemptId: string) => string;
}

const val = (o: Record<string, unknown> | null): string => {
  if (!o) return T.noScore;
  if (o.missed === true) return o.edit_reason === "Absent" ? T.absent : T.missed;
  return typeof o.score === "number" || typeof o.score === "string" ? formatCell(Number(o.score)) : T.noScore;
};

/** One line of the audit log in plain words, for the head judge's console (docs/PLAN-phase-5 step 4: "the audit log shows the old and new value"). */
export function auditLine(r: AuditRow, w: AuditWords): string {
  const after = r.after ?? {};
  const before = r.before ?? {};
  const because = r.reason ? ` — ${r.reason}` : "";
  const attempt = (o: Record<string, unknown>) => w.attemptWord(String(o.attempt_id ?? o.id ?? ""));
  switch (r.action) {
    case "score_edited":
      return `${w.judgeWord(String(after.judge_seat_id ?? before.judge_seat_id ?? ""))} · ${attempt(after)}: ${val(r.before)} → ${val(r.after)}${because}`;
    case "score_merged":
      return `${w.judgeWord(String(after.judge_seat_id ?? ""))} · ${attempt(after)}: ${T.scoreMoved}${because}`;
    case "impression_set":
      return `${w.judgeWord(String(after.judge_seat_id ?? ""))} · ${w.riderWord(String(after.entry_id ?? ""))}: ${T.impression} ${val(r.before)} → ${val(r.after)}${because}`;
    case "attempt_deleted":
      return `${T.deleted(w.attemptWord(String(after.id ?? "")))}${because}`;
    case "attempt_undone":
      return `${T.undone(w.attemptWord(String(after.id ?? "")))}${because}`;
    case "attempt_merged":
      return `${T.merged(w.attemptWord(String(after.id ?? "")))}${because}`;
    case "attempt_edited":
      return `${T.edited(w.attemptWord(String(after.id ?? "")))}${because}`;
    case "attempt_cap_override":
      return `${T.capOverride(w.riderWord(String(after.entry_id ?? "")))}${because}`;
    case "rider_status_set": {
      const m = after.modifier === null || after.modifier === undefined ? null : String(after.modifier);
      return `${w.riderWord(String(after.entry_id ?? ""))}: ${m ? (T.status[m] ?? m) : T.statusCleared}${because}`;
    }
    case "penalty_added":
      return `${T.interference(w.riderWord(String(after.entry_id ?? "")))}${because}`;
    case "penalty_removed":
      return `${T.interferenceRemoved(w.riderWord(String(before.entry_id ?? "")))}${because}`;
    case "heat_flag_out":
      return `${T.flagOut}${because}`;
    case "tie_decided": {
      const ids = Array.isArray(after.riderIds) ? (after.riderIds as string[]) : [];
      return `${T.tie(ids.map(w.riderWord))}${because}`;
    }
    case "heat_under_review":
      return `${T.review}${because}`;
    case "heat_published":
      return `${T.published}${because}`;
    case "publish_override":
      return `${T.publishOverride}${because}`;
    case "heat_reopened":
      return `${T.reopened}${because}`;
    case "sheet_reopened":
      return `${T.sheetReopened}${because}`;
    case "flag_resolved":
      return `${T.flagResolved}${because}`;
    case "heat_cancelled":
      return `${T.cancelled}${because}`;
    case "heat_rerun":
      return `${T.rerun}${because}`;
    default: {
      const words = r.action.replace(/_/g, " ");
      return `${words[0].toUpperCase()}${words.slice(1)}${because}`;
    }
  }
}
