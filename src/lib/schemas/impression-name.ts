import type { ScoringModel } from "./scoring-model";

/** What the score is called when nothing says otherwise. */
export const DEFAULT_IMPRESSION_NAME = "Impression";

/** The name judges, the console and the public see for this model's separate score ("Impression", "Variety"…). */
export const impressionNameOf = (model: ScoringModel | null | undefined): string => model?.heat.impression?.label ?? DEFAULT_IMPRESSION_NAME;

/**
 * The Event step's "Name of the impression score" laid over a division's model. Empty means the division keeps the name its own scoring gives it. A model without a
 * separate score is returned as it is: there is nothing to name.
 */
export function withImpressionName(model: ScoringModel, name: string | null | undefined): ScoringModel {
  const n = (name ?? "").trim();
  if (!n || !model.heat.impression) return model;
  return { ...model, heat: { ...model.heat, impression: { ...model.heat.impression, label: n } } };
}
