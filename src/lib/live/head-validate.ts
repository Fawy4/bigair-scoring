import { assertOnStep } from "@/lib/engine/scoring";
import type { Scale, ScoringModel } from "@/lib/schemas/scoring-model";

export type ScoreProblem = "SCORE_OFF_STEP" | "SCORE_OUT_OF_RANGE" | "SCORE_MISSING_CRITERION" | "SCORE_REQUIRED" | "NO_IMPRESSION";

function onScale(value: number, scale: Scale): ScoreProblem | null {
  if (!Number.isFinite(value) || value < scale.min - 1e-9 || value > scale.max + 1e-9) return "SCORE_OUT_OF_RANGE";
  try {
    assertOnStep(value, scale, "Score");
  } catch {
    return "SCORE_OFF_STEP";
  }
  return null;
}

/** A trick score the head judge types in (one score, or the criteria values) must pass the same scale and step check as a judge's pad. Missed needs no value. */
export function checkTrickScore(model: ScoringModel, v: { score?: number | null; criteria?: Record<string, number> | null; missed?: boolean }): ScoreProblem | null {
  if (v.missed) return null;
  if (model.trick.entry === "criteria") {
    for (const c of model.trick.criteria) {
      const x = v.criteria?.[c.key];
      if (x === undefined) return "SCORE_MISSING_CRITERION";
      const bad = onScale(x, c.scale ?? model.trick.scale);
      if (bad) return bad;
    }
    return null;
  }
  if (v.score === null || v.score === undefined) return "SCORE_REQUIRED";
  return onScale(v.score, model.trick.scale);
}

export function checkImpression(model: ScoringModel, value: number): ScoreProblem | null {
  const imp = model.heat.impression;
  if (!imp) return "NO_IMPRESSION";
  return onScale(value, imp.scale);
}
