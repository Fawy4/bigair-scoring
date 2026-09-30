import type { ScoringModel } from "@/lib/schemas/scoring-model";
import { copy } from "@/lib/ui-copy";

const num = (n: number) => String(Math.round(n * 1000) / 1000);
const s = copy.scoringSentence;

/** One plain sentence about a scoring model, e.g. "Best 3 of 7 attempts + Variety 0–10, 3 judges averaged". Pure. */
export function describeScoringModel(model: ScoringModel): string {
  const { heat, panel } = model;
  const cap = heat.maxAttemptsPerRider;
  const c = heat.counting;

  let counting: string;
  switch (c.type) {
    case "best_n":
      counting = cap ? s.bestNOfM(c.n, cap) : s.bestN(c.n);
      if (c.distinctTrickNames) counting += s.distinct;
      break;
    case "single_best":
      counting = cap ? s.singleOfM(cap) : s.single;
      break;
    case "all":
      counting = cap ? s.allUpTo(cap) : s.all;
      break;
    case "none":
      counting = s.none;
      break;
    case "best_per_category": {
      const each = c.perCategoryMax
        ? s.eachOf(Object.entries(c.perCategoryMax).map(([k, v]) => s.upTo(labelOf(model, k), v)).join(", "), c.maxPerCategory)
        : "";
      const groups = c.categoriesCounted ? s.groupsBest(c.categoriesCounted) : s.groupsAll;
      counting = s.perCategory(c.maxPerCategory, groups, each);
      if (cap) counting += s.attemptsSuffix(cap);
      break;
    }
  }

  if (heat.countedWeights && heat.countedWeights.some((w) => w !== 1)) counting += s.weighted(heat.countedWeights.map(num).join(" / "));
  if (heat.trickWeight !== 1 && c.type !== "none") counting += s.multiplied(num(heat.trickWeight));

  const imp = heat.impression;
  const impression = imp ? s.impression(imp.label, num(imp.scale.min), num(imp.scale.max), imp.weight !== 1 ? num(imp.weight) : "") : "";

  const how = panel.aggregate === "mean" ? s.averaged : panel.aggregate === "median" ? s.median : s.trimmed;
  return `${counting}${impression}, ${s.judges(panel.minJudges, how)}`;
}

function labelOf(model: ScoringModel, key: string): string {
  return model.categories.find((c) => c.key === key)?.label ?? key;
}

/**
 * The judges setting in words, e.g. "3 judges — plain average" or "5 judges — highest and lowest score dropped, the rest averaged".
 * Trimming only applies from `trimMinJudges` judges (default 5); below that the plain average is used automatically.
 */
export function describePanel(panel: { minJudges: number; maxJudges: number; aggregate: "mean" | "trimmed_mean" | "median"; trimMinJudges: number }): string {
  const p = copy.panelSentence;
  const n = panel.minJudges;
  if (panel.aggregate === "median") return p.median(n);
  if (panel.aggregate === "mean") return p.plain(n);
  if (n >= panel.trimMinJudges) return p.trimmed(n);
  return panel.maxJudges >= panel.trimMinJudges ? p.trimmedMixed(n, panel.trimMinJudges) : p.trimmedTooFew(n, panel.trimMinJudges);
}

export const panelRule = (trimMinJudges: number): string => copy.panelSentence.rule(trimMinJudges);
