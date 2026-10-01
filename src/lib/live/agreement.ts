import { judgeTrickScore, panelScore, type Attempt, type PanelInput } from "@/lib/engine/scoring";
import { farthestJudge } from "@/lib/engine/scoring/outlier";
import type { ScoringModel } from "@/lib/schemas/scoring-model";

export interface JudgeAgreement {
  judgeId: string;
  /** Landed attempts this judge scored. */
  attempts: number;
  /** The mean distance of this judge's trick scores from the panel score. */
  meanDistance: number;
  /** How many times this judge's cell was the outlier of its attempt. */
  outliers: number;
}

/** After the heat: how closely each judge scored with the panel (docs/08 §1H-4). Crashed attempts and Missed answers are not part of it. */
export function agreementReport(model: ScoringModel, panelJudgeIds: string[], attempts: Attempt[]): JudgeAgreement[] {
  const acc = new Map(panelJudgeIds.map((j) => [j, { n: 0, sum: 0, out: 0 }]));
  for (const a of attempts) {
    if (a.status !== "landed" || a.deleted) continue;
    const inputs: PanelInput[] = [];
    for (const m of a.marks) {
      if (!acc.has(m.judgeId)) continue;
      if (m.value === "missed") continue;
      try {
        inputs.push({ judgeId: m.judgeId, score: judgeTrickScore(model, m.value, { heightM: a.heightM }).score });
      } catch {
        /* a value the model refuses is not part of the report */
      }
    }
    const panel = panelScore(model, inputs, panelJudgeIds);
    if (panel.score === null) continue;
    const scores = inputs.filter((i): i is { judgeId: string; score: number } => typeof i.score === "number");
    const out = panel.outlier ? farthestJudge(scores) : null;
    for (const s of scores) {
      const e = acc.get(s.judgeId)!;
      e.n += 1;
      e.sum += Math.abs(s.score - panel.score);
      if (s.judgeId === out) e.out += 1;
    }
  }
  return panelJudgeIds.map((judgeId) => {
    const e = acc.get(judgeId)!;
    return { judgeId, attempts: e.n, meanDistance: e.n ? e.sum / e.n : 0, outliers: e.out };
  });
}
