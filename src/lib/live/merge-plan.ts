/** Merging two attempts that are one (decision 10: the dialog defaults to the first logged, for the attempt and for each score). */
export function defaultKeep(attempts: Array<{ id: string; created_at: string; seq: number }>): { keep: string; drop: string[] } {
  const sorted = [...attempts].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.seq - b.seq);
  return { keep: sorted[0].id, drop: sorted.slice(1).map((a) => a.id) };
}

export interface ScoreOfAttempt {
  attemptId: string;
  judgeId: string;
  /** null = the judge answered Missed. */
  value: number | null;
}

export interface MergePlan {
  /** Each judge's answer on the kept attempt after the merge. */
  final: Record<string, number | null>;
  /** Answers that move to the kept attempt from a dropped one. */
  moves: Array<{ judgeId: string; from: string; value: number | null }>;
  /** Judges who answered on both: the kept attempt's score stays unless the head judge chose the other. */
  conflicts: Array<{ judgeId: string; keepValue: number | null; dropValue: number | null; takes: "keep" | "drop" }>;
}

export function mergePlan(keep: string, drops: string[], scores: ScoreOfAttempt[], choices: Record<string, "keep" | "drop">): MergePlan {
  const final: Record<string, number | null> = {};
  const moves: MergePlan["moves"] = [];
  const conflicts: MergePlan["conflicts"] = [];
  for (const s of scores.filter((x) => x.attemptId === keep)) final[s.judgeId] = s.value;
  const kept = new Set(Object.keys(final));
  for (const drop of drops) {
    for (const s of scores.filter((x) => x.attemptId === drop).sort((a, b) => a.judgeId.localeCompare(b.judgeId))) {
      if (!kept.has(s.judgeId) && !(s.judgeId in final)) {
        final[s.judgeId] = s.value;
        moves.push({ judgeId: s.judgeId, from: drop, value: s.value });
      } else if (kept.has(s.judgeId)) {
        const takes = choices[s.judgeId] ?? "keep";
        conflicts.push({ judgeId: s.judgeId, keepValue: scores.find((x) => x.attemptId === keep && x.judgeId === s.judgeId)!.value, dropValue: s.value, takes });
        if (takes === "drop") {
          final[s.judgeId] = s.value;
          moves.push({ judgeId: s.judgeId, from: drop, value: s.value });
        }
      }
    }
  }
  return { final, moves, conflicts };
}

export type PastCapRole = "head" | "organiser" | "judge" | "spotter" | "announcer";

/** Who may add an attempt past the cap (decision 8): the head judge, or an organiser when the event has no active head judge; always with a reason. */
export function canAddPastCap(input: { role: PastCapRole; hasActiveHead: boolean; reason: string }): { ok: true } | { ok: false; code: "NOT_ALLOWED" | "OVERRIDE_REASON_REQUIRED" } {
  const allowed = input.role === "head" || (input.role === "organiser" && !input.hasActiveHead);
  if (!allowed) return { ok: false, code: "NOT_ALLOWED" };
  if (input.reason.trim().length === 0) return { ok: false, code: "OVERRIDE_REASON_REQUIRED" };
  return { ok: true };
}
