import type { Scale, ScoringModel } from "@/lib/schemas/scoring-model";
import { roundHalfUp } from "./round";
import type { JudgeScoreDetail, PanelJudgeEntry, PanelScore } from "./types";

export interface PanelInput {
  judgeId: string;
  score: number | "missed";
  detail?: JudgeScoreDetail;
}

/**
 * Aggregates the judges' scores for one attempt (or one impression) — doc 03 §4.2.
 * - Judges on the panel with no entry are `missing` (→ incomplete); "missed" entries are not.
 * - Entries from judges not on the panel are ignored.
 * - `scale` is used for the outlier check (defaults to the trick scale).
 */
export function panelScore(
  model: ScoringModel,
  scores: PanelInput[],
  panelJudgeIds: string[],
  scale: Scale = model.trick.scale,
): PanelScore {
  const { panel } = model;
  const onPanel = new Set(panelJudgeIds);
  const byJudge = new Map<string, PanelInput>();
  for (const s of scores) if (onPanel.has(s.judgeId)) byJudge.set(s.judgeId, s);

  const missing = panelJudgeIds.filter((j) => !byJudge.has(j));
  const missedBy = panelJudgeIds.filter((j) => byJudge.get(j)?.score === "missed");
  const judgeScores: PanelJudgeEntry[] = panelJudgeIds.flatMap((j) => {
    const s = byJudge.get(j);
    if (!s || s.score === "missed") return [];
    return [s.detail ? { judgeId: j, score: s.score, detail: s.detail } : { judgeId: j, score: s.score }];
  });

  const base = { judgeScores, incomplete: missing.length > 0, missing, missedBy };
  const k = judgeScores.length;
  if (k === 0) return { ...base, score: null, unrounded: null, outlier: false };

  const values = judgeScores.map((j) => j.score);
  let unrounded: number;

  if (panel.aggregate === "median") {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(k / 2);
    unrounded = k % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  } else if (panel.aggregate === "trimmed_mean" && k >= panel.trimMinJudges) {
    // Drop exactly one highest and one lowest (first occurrence in panel order).
    const order = judgeScores.map((_, i) => i).sort((a, b) => values[a] - values[b] || a - b);
    const low = order[0];
    const high = order[order.length - 1];
    judgeScores[low].trimmed = true;
    judgeScores[high].trimmed = true;
    const kept = values.filter((_, i) => i !== low && i !== high);
    unrounded = kept.reduce((s, v) => s + v, 0) / kept.length;
  } else {
    unrounded = values.reduce((s, v) => s + v, 0) / k;
  }

  const spread = Math.max(...values) - Math.min(...values);
  const limit = (panel.outlierWarnPct / 100) * (scale.max - scale.min);

  return {
    ...base,
    score: roundHalfUp(unrounded, panel.decimals),
    unrounded,
    outlier: k >= 2 && spread > limit + 1e-9,
  };
}
