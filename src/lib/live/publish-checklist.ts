import type { PublishBlocker } from "@/lib/engine/scoring";
import { copy } from "@/lib/ui-copy";

const C = copy.checklist;

export type ChecklistKind = "sheet" | "score" | "impression" | "tie";
export interface ChecklistItem {
  kind: ChecklistKind;
  text: string;
  /** The riders a tie is about (for "Choose order"). */
  riders?: string[];
}
export interface Checklist {
  items: ChecklistItem[];
  /** Everything but a tie can be published past, with a reason (decision 3). */
  canOverride: boolean;
}

const ORDER: ChecklistKind[] = ["sheet", "score", "impression", "tie"];

/** What blocks Publish, in plain words and in a fixed order: submitted sheets, scores, Impression scores, ties (docs/08 §1H-7). */
export function publishChecklist(input: {
  blockers: PublishBlocker[];
  /** Panel judges who have not submitted. */
  unsubmitted: string[];
  judgeNumber: (judgeId: string) => number;
  riderLabel: (riderId: string) => string;
  impressionLabel: string;
}): Checklist {
  const judge = (id: string) => copy.live.matrix.judge(input.judgeNumber(id));
  const items: ChecklistItem[] = [];
  for (const j of input.unsubmitted) items.push({ kind: "sheet", text: C.sheet(judge(j)) });
  for (const b of input.blockers) {
    if (b.type === "score_missing") items.push({ kind: "score", text: C.score(judge(b.judge), input.riderLabel(b.rider), b.attemptSeq) });
    else if (b.type === "impression_missing") items.push({ kind: "impression", text: C.impression(judge(b.judge), input.impressionLabel, input.riderLabel(b.rider)) });
    else {
      const names = b.riders.map(input.riderLabel);
      items.push({ kind: "tie", text: C.tie(names.length <= 2 ? names.join(C.and) : `${names.slice(0, -1).join(", ")}${C.and}${names[names.length - 1]}`), riders: b.riders });
    }
  }
  items.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  return { items, canOverride: !items.some((i) => i.kind === "tie") };
}
