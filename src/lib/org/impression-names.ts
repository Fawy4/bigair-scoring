import { SCORING_NULLABLE, mergeOverrides } from "@/lib/scoring-ui/overrides";
import { impressionNameOf } from "@/lib/schemas/impression-name";
import { parseScoringModel } from "@/lib/schemas/scoring-model";

/** What each division of the event calls its separate score now (its model with its own overrides), the same name once, in division order. A division with no separate score adds nothing. */
export function divisionImpressionNames(rows: ReadonlyArray<{ scoring_overrides: unknown; scoring_models: { json: unknown } | null }>): string[] {
  const names: string[] = [];
  for (const r of rows) {
    if (!r.scoring_models) continue;
    try {
      const model = parseScoringModel(mergeOverrides(r.scoring_models.json as never, r.scoring_overrides as never, SCORING_NULLABLE));
      if (!model.heat.impression) continue;
      const name = impressionNameOf(model);
      if (!names.includes(name)) names.push(name);
    } catch {
      /* a model that cannot be read adds nothing */
    }
  }
  return names;
}

/** The empty field's placeholder: the divisions' current names, or the default word when none of them has the score. */
export const impressionPlaceholder = (names: readonly string[], fallback: string): string => (names.length ? names.join(", ") : fallback);
