import { assertOnStep } from "@/lib/engine/scoring";
import type { Scale, ScoringModel } from "@/lib/schemas/scoring-model";

export type ScoreProblem = "SCORE_OFF_STEP" | "SCORE_OUT_OF_RANGE" | "SCORE_MISSING_CRITERION" | "SCORE_REQUIRED" | "NO_IMPRESSION";

/** A refusal with the detail its sentence needs (the same "CODE: detail" the database raises, see errors.ts): the step and its two neighbours, or the range. */
export interface ScoreRefusal {
  code: ScoreProblem;
  detail?: string;
}

const text = (n: number) => String(Number(n.toFixed(6)));

/** The step-aligned values just below and just above `value` (counted from the scale's minimum, kept inside the scale). */
export function stepNeighbours(value: number, scale: Scale): [number, number] {
  const steps = Number(((value - scale.min) / scale.step).toPrecision(12));
  const last = Math.floor(Number(((scale.max - scale.min) / scale.step).toPrecision(12)) + 1e-9);
  const at = (n: number) => scale.min + Math.min(last, Math.max(0, n)) * scale.step;
  return [at(Math.floor(steps)), at(Math.ceil(steps))];
}

function onScale(value: number, scale: Scale): ScoreRefusal | null {
  if (!Number.isFinite(value) || value < scale.min - 1e-9 || value > scale.max + 1e-9) return { code: "SCORE_OUT_OF_RANGE", detail: `${text(scale.min)}|${text(scale.max)}` };
  try {
    assertOnStep(value, scale, "Score");
  } catch {
    const [below, above] = stepNeighbours(value, scale);
    return { code: "SCORE_OFF_STEP", detail: `${text(scale.step)}|${text(below)}|${text(above)}` };
  }
  return null;
}

/** A trick score the head judge types in (one score, or the criteria values) must pass the same scale and step check as a judge's pad. Missed needs no value. */
export function trickScoreRefusal(model: ScoringModel, v: { score?: number | null; criteria?: Record<string, number> | null; missed?: boolean }): ScoreRefusal | null {
  if (v.missed) return null;
  if (model.trick.entry === "criteria") {
    for (const c of model.trick.criteria) {
      const x = v.criteria?.[c.key];
      if (x === undefined) return { code: "SCORE_MISSING_CRITERION" };
      const bad = onScale(x, c.scale ?? model.trick.scale);
      if (bad) return bad;
    }
    return null;
  }
  if (v.score === null || v.score === undefined) return { code: "SCORE_REQUIRED" };
  return onScale(v.score, model.trick.scale);
}

export function impressionRefusal(model: ScoringModel, value: number): ScoreRefusal | null {
  const imp = model.heat.impression;
  if (!imp) return { code: "NO_IMPRESSION" };
  return onScale(value, imp.scale);
}

export const checkTrickScore = (model: ScoringModel, v: Parameters<typeof trickScoreRefusal>[1]): ScoreProblem | null => trickScoreRefusal(model, v)?.code ?? null;
export const checkImpression = (model: ScoringModel, value: number): ScoreProblem | null => impressionRefusal(model, value)?.code ?? null;
