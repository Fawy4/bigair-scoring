import type { HeightMapping, Scale, ScoringModel } from "@/lib/schemas/scoring-model";
import { assertOnStep, ScoringInputError } from "./round";
import type { CriteriaValues, CriterionDetail, JudgeTrickScore } from "./types";

/** Maps a measured height (metres) to a criterion score, clamped to the criterion's scale. */
export function mapHeight(mapping: HeightMapping, heightM: number, scale: Scale): number {
  let score: number;
  if (mapping.type === "linear") {
    const t = (heightM - mapping.fromM) / (mapping.toM - mapping.fromM);
    const clamped = Math.min(1, Math.max(0, t));
    score = mapping.toScore[0] + clamped * (mapping.toScore[1] - mapping.toScore[0]);
  } else {
    const band = [...mapping.bands].sort((a, b) => b.minM - a.minM).find((b) => heightM >= b.minM);
    score = band ? band.score : scale.min;
  }
  return Math.min(scale.max, Math.max(scale.min, score));
}

/** True when this model fills a criterion from the height sensor. */
export function usesHeightCriterion(model: ScoringModel): boolean {
  return model.heightSensor.enabled && model.heightSensor.use === "height_criterion";
}

/**
 * One judge's score for one landed attempt (doc 03 §4.1).
 * - single: the mark itself (validated against trick.scale and its step)
 * - criteria + weighted_mean: normalised weighted mean mapped onto trick.scale
 * - criteria + sum: Σ criteria
 * The sensor-filled criterion (if any) ignores the judge's value when a height reading exists.
 */
export function judgeTrickScore(
  model: ScoringModel,
  mark: number | CriteriaValues,
  opts: { heightM?: number | null } = {},
): JudgeTrickScore {
  const { trick } = model;

  if (trick.entry === "none") {
    throw new ScoringInputError(`Model "${model.id}" does not score individual tricks`);
  }

  if (trick.entry === "single") {
    if (typeof mark !== "number") {
      throw new ScoringInputError(`Model "${model.id}" expects a single mark per trick`);
    }
    assertOnStep(mark, trick.scale, "Trick mark");
    return { score: mark, detail: {} };
  }

  if (typeof mark === "number") {
    throw new ScoringInputError(`Model "${model.id}" expects criteria marks per trick`);
  }

  const known = new Set(trick.criteria.map((c) => c.key));
  const unknown = Object.keys(mark).filter((k) => !known.has(k));
  if (unknown.length > 0) {
    throw new ScoringInputError(`Unknown criteria: ${unknown.join(", ")}`);
  }

  const sensorOn = usesHeightCriterion(model);
  const hasReading = opts.heightM !== undefined && opts.heightM !== null;
  let sensorMissing = false;

  const criteria: CriterionDetail[] = trick.criteria.map((c) => {
    if (sensorOn && c.sensorFill === "height") {
      if (hasReading) {
        return { key: c.key, value: mapHeight(model.heightSensor.mapping!, opts.heightM!, c.scale), source: "sensor" };
      }
      sensorMissing = true;
    }
    const value = mark[c.key];
    if (value === undefined) {
      throw new ScoringInputError(`Missing criterion "${c.label}"`);
    }
    assertOnStep(value, c.scale, c.label);
    return { key: c.key, value, source: "judge" };
  });

  let score: number;
  if (trick.combine === "sum") {
    score = criteria.reduce((s, c) => s + c.value, 0);
  } else {
    let weighted = 0;
    let weights = 0;
    trick.criteria.forEach((c, i) => {
      weighted += (c.weight * (criteria[i].value - c.scale.min)) / (c.scale.max - c.scale.min);
      weights += c.weight;
    });
    score = (weighted / weights) * (trick.scale.max - trick.scale.min) + trick.scale.min;
  }

  return { score, detail: sensorMissing ? { criteria, sensorMissing } : { criteria } };
}
