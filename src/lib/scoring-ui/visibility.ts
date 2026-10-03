/**
 * Where each scoring setting is shown (Polish 2, item 8). The main dials are drawn by hand at the top of the Scoring tab: what judges enter per trick, the
 * scale, which tricks count and how many, attempts per rider, Impression / Variety on or off and its scale, judges and how their scores are combined (trimming
 * only when the trimmed average is chosen). Everything else is under More settings, and a setting that only applies to a choice shows only when that choice
 * is made (the criteria table only for several criteria, categories only when tricks count per category, the sensor's details only when it is on …).
 */

/** Settings drawn as main dials (or not settings at all: the preset's name, the fixed DNS / DSQ rules), so never under More settings. */
export const SCORING_MAIN_PATHS = [
  "name",
  "description",
  "trick.entry",
  "trick.scale",
  "heat.counting.n",
  "heat.counting.maxPerCategory",
  "heat.maxAttemptsPerRider",
  "heat.impression.scale",
  "panel.minJudges",
  "panel.aggregate",
  "panel.trimMinJudges",
  "modifiers.dns",
  "modifiers.dsq",
] as const;

/** A choice or an on/off whose switch is a main dial: More settings draws only what the current choice adds (its own switch is not drawn twice). */
export const SCORING_FLAT_PATHS = ["heat.counting", "heat.impression"] as const;

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The paths More settings leaves out for this model: the main dials, and every setting whose choice is not made. */
export function scoringMoreHidden(model: unknown): string[] {
  const m = (model ?? {}) as Any;
  const out: string[] = [...SCORING_MAIN_PATHS];
  const entry = m.trick?.entry;
  if (entry !== "criteria") out.push("trick.criteria", "trick.combine");
  if (entry === "none") out.push("trick.crash", "trick.allowNoScore");
  if (m.heat?.counting?.type !== "best_per_category") out.push("categories");
  if ((m.heat?.total?.display ?? "raw") === "raw") out.push("heat.total.maxRaw");
  const penalty = m.modifiers?.interference?.penalty;
  if (penalty !== "percent" && penalty !== "points") out.push("modifiers.interference.value");
  const hs = m.heightSensor ?? {};
  if (!hs.enabled) out.push("heightSensor.source", "heightSensor.use", "heightSensor.mapping", "heightSensor.bonus", "heightSensor.award");
  else {
    if (hs.use !== "height_criterion") out.push("heightSensor.mapping");
    if (hs.use !== "bonus") out.push("heightSensor.bonus");
  }
  return out;
}
