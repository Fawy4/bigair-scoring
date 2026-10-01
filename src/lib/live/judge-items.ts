import { repeatIndexes } from "@/lib/engine/scoring";
import { normaliseTrickName } from "@/lib/engine/scoring";
import type { QueueItem } from "./queue-model";
import { ordinal } from "./ordinal";

export interface LiveAttemptRow {
  id: string;
  entryId: string;
  seq: number;
  status: "landed" | "crashed";
  trickName: string | null;
  direction: "left" | "right" | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface MyScoreRow {
  attemptId: string;
  score: number | null;
  missed: boolean;
}

export interface JudgeItem extends QueueItem {
  id: string;
  entryId: string;
  seq: number;
  trick: string;
  direction: "left" | "right" | null;
  createdAt: string;
  repeat?: { nth: string; previous: string | null };
}

/**
 * The judge's scoring queue from live data (docs/08 §1G-8): attempts in the order the spotters logged them, deleted ones left out. A crashed attempt is
 * listed (the history says "Crashed") but never needs a score. Landed attempts that repeat an earlier landing of the same trick carry a Repeat badge
 * with what this judge gave the last time.
 */
export function buildJudgeItems(attempts: LiveAttemptRow[], myScores: MyScoreRow[], writeScore: (n: number) => string): JudgeItem[] {
  const live = attempts.filter((a) => !a.deletedAt);
  const mine = new Map(myScores.map((s) => [s.attemptId, s]));
  const byRider = new Map<string, LiveAttemptRow[]>();
  for (const a of live) byRider.set(a.entryId, [...(byRider.get(a.entryId) ?? []), a]);
  const repeat = new Map<string, number>();
  for (const rows of byRider.values()) {
    const idx = repeatIndexes(rows.map((a) => ({ seq: a.seq, status: a.status, trickName: a.trickName ?? undefined, marks: [] })));
    for (const a of rows) repeat.set(a.id, idx.get(a.seq)?.repeatIndex ?? 0);
  }
  return [...live]
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.seq - b.seq)
    .map((a): JudgeItem => {
      const s = mine.get(a.id);
      const score: JudgeItem["score"] = s ? (s.missed ? "missed" : s.score) : null;
      const item: JudgeItem = { id: a.id, entryId: a.entryId, seq: a.seq, status: a.status, score, trick: a.trickName ?? "", direction: a.direction, createdAt: a.createdAt };
      const times = repeat.get(a.id) ?? 0;
      if (a.status === "landed" && times > 0) {
        const key = normaliseTrickName(a.trickName);
        const earlier = (byRider.get(a.entryId) ?? []).filter((x) => x.seq < a.seq && x.status === "landed" && normaliseTrickName(x.trickName) === key).sort((x, y) => y.seq - x.seq);
        const before = earlier.map((x) => mine.get(x.id)).find((m) => m && !m.missed && m.score !== null);
        item.repeat = { nth: ordinal(times + 1), previous: before && before.score !== null ? writeScore(before.score) : null };
      }
      return item;
    });
}
