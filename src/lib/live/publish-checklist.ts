import type { PublishBlocker } from "@/lib/engine/scoring";
import { copy } from "@/lib/ui-copy";

const C = copy.checklist;

export type ChecklistKind = "sheet" | "score" | "impression" | "pending" | "tie";
/** Where a blocker is fixed: one judge's cell of one attempt, one judge's Impression / Variety score of one rider, or the judge's sheet. */
export type FixTarget =
  | { kind: "score"; seatId: string; attemptId: string }
  | { kind: "impression"; seatId: string; entryId: string }
  | { kind: "sheet"; seatId: string };
export interface ChecklistItem {
  kind: ChecklistKind;
  text: string;
  /** The riders a tie is about (for "Choose order"). */
  riders?: string[];
  /** The judge (seat id) the line is about. */
  judge?: string;
  /** Where the "Fix" button of the line goes; absent when the console cannot open it (a tie has its own "Choose order"). */
  target?: FixTarget;
}
export interface Checklist {
  items: ChecklistItem[];
  /** Everything but a tie, or a score typed with no attempt, can be published past, with a reason (decision 3). */
  canOverride: boolean;
}

const ORDER: ChecklistKind[] = ["sheet", "score", "impression", "pending", "tie"];

/**
 * What blocks Publish, in plain words and in a fixed order: submitted sheets, scores, Impression scores, ties (docs/08 §1H-7). Every line names the judge and
 * the exact thing ("Fawy: Impression / Variety score for Omar missing"; "Fawy: sheet not submitted — 3 attempts unscored") and carries where to fix it.
 */
export function publishChecklist(input: {
  blockers: PublishBlocker[];
  /** Panel judges whose sheet holds Publish back. */
  unsubmitted: string[];
  /** The judge as a word in a sentence: the seat's name ("Fawy"). */
  judgeWord: (judgeId: string) => string;
  riderLabel: (riderId: string) => string;
  impressionLabel: string;
  /** The attempt's id from the rider and the attempt number, so a missing score's line opens that cell. */
  attemptIdOf?: (riderId: string, seq: number) => string | undefined;
  /** Scores judges typed on the Rider sheet that still have no attempt: one entry per rider and judge. They hold Publish back with no override. */
  pending?: Array<{ riderId: string; judgeId: string }>;
  /** The rider as the blocker names them ("Omar Hassan"); the rider's word when not given. */
  riderName?: (riderId: string) => string;
  /** The judge as the blocker names them ("J3"); the judge's word when not given. */
  judgeTag?: (judgeId: string) => string;
}): Checklist {
  const judge = input.judgeWord;
  const targetOf = (b: PublishBlocker): FixTarget | undefined => {
    if (b.type === "impression_missing") return { kind: "impression", seatId: b.judge, entryId: b.rider };
    if (b.type === "score_missing") {
      const attemptId = input.attemptIdOf?.(b.rider, b.attemptSeq);
      return attemptId ? { kind: "score", seatId: b.judge, attemptId } : undefined;
    }
    return undefined;
  };
  const items: ChecklistItem[] = [];
  for (const j of input.unsubmitted) {
    const mine = input.blockers.filter((b) => b.type !== "tie_unresolved" && b.judge === j);
    const attempts = mine.filter((b) => b.type === "score_missing").length;
    const impressions = mine.filter((b) => b.type === "impression_missing").length;
    const first = mine.map(targetOf).find(Boolean);
    items.push({ kind: "sheet", judge: j, text: C.sheet(judge(j), C.sheetDetail(attempts, impressions, input.impressionLabel)), target: first ?? { kind: "sheet", seatId: j } });
  }
  for (const b of input.blockers) {
    const target = targetOf(b);
    if (b.type === "score_missing") items.push({ kind: "score", judge: b.judge, text: C.score(judge(b.judge), input.riderLabel(b.rider), b.attemptSeq), ...(target ? { target } : {}) });
    else if (b.type === "impression_missing") items.push({ kind: "impression", judge: b.judge, text: C.impression(judge(b.judge), input.impressionLabel, input.riderLabel(b.rider)), ...(target ? { target } : {}) });
    else {
      const names = b.riders.map(input.riderLabel);
      items.push({ kind: "tie", text: C.tie(names.length <= 2 ? names.join(C.and) : `${names.slice(0, -1).join(", ")}${C.and}${names[names.length - 1]}`), riders: b.riders });
    }
  }
  for (const n of input.pending ?? []) {
    items.push({ kind: "pending", judge: n.judgeId, text: C.pending((input.riderName ?? input.riderLabel)(n.riderId), (input.judgeTag ?? judge)(n.judgeId)), riders: [n.riderId] });
  }
  items.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  return { items, canOverride: !items.some((i) => i.kind === "tie" || i.kind === "pending") };
}

/** One blocker per rider and panel judge who still holds a note typed on the Rider sheet with no attempt behind it. */
export function pendingBlockers(notes: Array<{ entry_id: string; judge_seat_id: string }>, panelSeatIds: string[]): Array<{ riderId: string; judgeId: string }> {
  const seen = new Set<string>();
  const out: Array<{ riderId: string; judgeId: string }> = [];
  for (const n of notes) {
    const key = `${n.entry_id}|${n.judge_seat_id}`;
    if (!panelSeatIds.includes(n.judge_seat_id) || seen.has(key)) continue;
    seen.add(key);
    out.push({ riderId: n.entry_id, judgeId: n.judge_seat_id });
  }
  // rider by rider (in the order the notes arrive), the judges of one rider in panel order
  const riders = [...new Set(out.map((o) => o.riderId))];
  return out.sort((a, b) => riders.indexOf(a.riderId) - riders.indexOf(b.riderId) || panelSeatIds.indexOf(a.judgeId) - panelSeatIds.indexOf(b.judgeId));
}
