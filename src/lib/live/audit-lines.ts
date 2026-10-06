import { formatCell } from "./matrix-model";
import { copy } from "@/lib/ui-copy";

const T = copy.audit;

export interface AuditRow {
  id: string;
  action: string;
  /** The table the line is about ("trick_scores" for a judge changing their own score). */
  table_name?: string;
  reason: string | null;
  at: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface AuditWords {
  /** Judge seat id → the judge as a word (the seat's name, "Fawy"). */
  judgeWord: (seatId: string) => string;
  riderWord: (entryId: string) => string;
  /** The rider's name for sentences that name them in full ("Omar Hassan"); the rider word when not given. */
  riderName?: (entryId: string) => string;
  /** "Red 3": the rider and the attempt number. */
  attemptWord: (attemptId: string) => string;
  /** The time of day of a change, in the event's time zone ("14:21:05"); none when not given. */
  clock?: (iso: string) => string;
}

/** A line worth showing among the named changes: a judge changing their own score (the audit log keeps every one of them; the console lists the ones that changed a number). */
export function isScoreChange(r: Pick<AuditRow, "action" | "table_name" | "before" | "after">): boolean {
  if (r.action !== "update" || r.table_name !== "trick_scores" || !r.before || !r.after) return false;
  return r.before.score !== r.after.score || r.before.missed !== r.after.missed;
}

/** "14:21:05" in the event's time zone. */
export function timeOfDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(iso));
}

const val = (o: Record<string, unknown> | null): string => {
  if (!o) return T.noScore;
  if (o.missed === true) return o.edit_reason === "Absent" ? T.absent : T.missed;
  return typeof o.score === "number" || typeof o.score === "string" ? formatCell(Number(o.score)) : T.noScore;
};

/** An Impression / Variety score as it was: its value, Absent, or nothing yet. */
const impressionVal = (o: Record<string, unknown> | null): string => {
  if (!o) return T.noScore;
  if (o.missed === true) return T.absent;
  return typeof o.value === "number" || typeof o.value === "string" ? formatCell(Number(o.value)) : T.noScore;
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
    case "update":
      if (isScoreChange({ action: r.action, table_name: r.table_name, before: r.before, after: r.after }))
        return T.scoreChanged(w.judgeWord(String(after.judge_seat_id ?? before.judge_seat_id ?? "")), attempt(after), val(r.before), val(r.after), w.clock ? w.clock(r.at) : null);
      return rowFallback(r, because);
    case "pending_cleared_by_head":
      return T.noteClearedByHead(w.judgeWord(String(before.judge_seat_id ?? "")), (w.riderName ?? w.riderWord)(String(before.entry_id ?? "")), Number(before.line ?? 0), r.reason);
    case "score_from_note":
      return T.scoreFromNote(w.judgeWord(String(after.judge_seat_id ?? "")), attempt(after), val(r.after));
    case "score_merged":
      return `${w.judgeWord(String(after.judge_seat_id ?? ""))} · ${attempt(after)}: ${T.scoreMoved}${because}`;
    case "impression_set":
      return `${w.judgeWord(String(after.judge_seat_id ?? ""))} · ${w.riderWord(String(after.entry_id ?? ""))}: ${T.impression} ${impressionVal(r.before)} → ${impressionVal(r.after)}${because}`;
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
    case "sheet_submitted_by_head":
      return `${w.judgeWord(String(after.judge_seat_id ?? ""))}: ${T.sheetSubmittedByHead}${because}`;
    case "flag_resolved":
      return `${T.flagResolved}${because}`;
    case "heat_cancelled":
      return `${T.cancelled}${because}`;
    case "heat_rerun":
      return `${T.rerun}${because}`;
    default:
      return rowFallback(r, because);
  }
}

function rowFallback(r: AuditRow, because: string): string {
  const words = r.action.replace(/_/g, " ");
  return `${words[0].toUpperCase()}${words.slice(1)}${because}`;
}
