import type { ScoringModel } from "@/lib/schemas/scoring-model";

const num = (n: number) => String(Math.round(n * 1000) / 1000);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** One plain sentence about a scoring model, e.g. "Best 3 of 7 attempts + Variety 0–10, 3 judges averaged". Pure. */
export function describeScoringModel(model: ScoringModel): string {
  const { heat, panel } = model;
  const cap = heat.maxAttemptsPerRider;
  const c = heat.counting;

  let counting: string;
  switch (c.type) {
    case "best_n":
      counting = cap ? `Best ${c.n} of ${cap} attempts` : `Best ${c.n} ${plural(c.n, "trick", "tricks")}`;
      if (c.distinctTrickNames) counting += " (each trick name counts once)";
      break;
    case "single_best":
      counting = cap ? `Single best trick of ${cap} attempts` : "Single best trick";
      break;
    case "all":
      counting = cap ? `All tricks count (up to ${cap} attempts)` : "All tricks count";
      break;
    case "none":
      counting = "Judges do not score individual tricks";
      break;
    case "best_per_category": {
      const each = c.perCategoryMax
        ? ` (${Object.entries(c.perCategoryMax).map(([k, v]) => `${labelOf(model, k)} up to ${v}`).join(", ")}; others ${c.maxPerCategory})`
        : "";
      const groups = c.categoriesCounted ? `the best ${c.categoriesCounted} categories` : "every category";
      counting = `Best ${c.maxPerCategory} ${plural(c.maxPerCategory, "trick", "tricks")} per category in ${groups}${each}`;
      if (cap) counting += `, ${cap} attempts`;
      break;
    }
  }

  if (heat.countedWeights && heat.countedWeights.some((w) => w !== 1)) {
    counting += `, counted tricks weighted ${heat.countedWeights.map(num).join(" / ")}`;
  }
  if (heat.trickWeight !== 1 && c.type !== "none") counting += `, tricks × ${num(heat.trickWeight)}`;

  const imp = heat.impression;
  const impression = imp ? ` + ${imp.label} ${num(imp.scale.min)}–${num(imp.scale.max)}${imp.weight !== 1 ? ` × ${num(imp.weight)}` : ""}` : "";

  const how = panel.aggregate === "mean" ? "averaged" : panel.aggregate === "median" ? "median" : "trimmed average";
  const judges = `${panel.minJudges} ${plural(panel.minJudges, "judge", "judges")} ${how}`;

  return `${counting}${impression}, ${judges}`;
}

function labelOf(model: ScoringModel, key: string): string {
  return model.categories.find((c) => c.key === key)?.label ?? key;
}
