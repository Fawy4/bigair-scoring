import { judgeTrickScore } from "@/lib/engine/scoring";
import type { ScoringModel } from "@/lib/schemas/scoring-model";
import type { CriterionRow } from "@/components/live/criteria-rows";

/** The criteria tabs of a model that scores by criteria; null for a single mark (one pad). */
export function criteriaRows(model: ScoringModel): CriterionRow[] | null {
  if (model.trick.entry !== "criteria" || !model.trick.criteria.length) return null;
  return model.trick.criteria.map((c) => ({ key: c.key, label: c.label, ...(c.help ? { help: c.help } : {}), scale: c.scale }));
}

/** The trick score from the criteria given so far; null until every criterion has a value. */
export function criteriaScore(model: ScoringModel, values: Record<string, number | undefined>): number | null {
  if (model.trick.entry !== "criteria") return null;
  if (!model.trick.criteria.every((c) => typeof values[c.key] === "number")) return null;
  try {
    return judgeTrickScore(model, values as Record<string, number>).score;
  } catch {
    return null;
  }
}
