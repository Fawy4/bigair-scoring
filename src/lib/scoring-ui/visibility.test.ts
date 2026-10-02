import { describe, expect, it } from "vitest";
import kota from "../../../presets/scoring/kota-best3-impression.json";
import legacy from "../../../presets/scoring/legacy-kol-best3-variety.json";
import gka from "../../../presets/scoring/gka-category-overall.json";
import { countVisible } from "@/lib/schema-form/count";
import { schemaToNodes } from "@/lib/schema-form/nodes";
import { parseScoringModel, ScoringModelSchema } from "@/lib/schemas/scoring-model";
import { SCORING_HIDDEN, SCORING_LABELS } from "@/lib/ui-copy";
import { scoringMoreHidden, SCORING_FLAT_PATHS, SCORING_MAIN_PATHS } from "./visibility";

// Polish 2, item 8: the main dials first; everything that only applies to a choice shows only when that choice is made; More settings holds the rest.
const nodes = schemaToNodes(ScoringModelSchema, SCORING_LABELS, SCORING_HIDDEN);
const more = (m: unknown) => countVisible(nodes, m, { hidden: SCORING_HIDDEN, hiddenPaths: scoringMoreHidden(m), flatPaths: SCORING_FLAT_PATHS });
const model = (j: unknown, edit?: (m: Record<string, any>) => void) => {
  const m = structuredClone(parseScoringModel(structuredClone(j))) as unknown as Record<string, any>;
  edit?.(m);
  return m;
};

describe("which scoring settings show where", () => {
  it("the main dials never repeat under More settings", () => {
    const hidden = scoringMoreHidden(model(legacy));
    for (const p of SCORING_MAIN_PATHS) expect(hidden).toContain(p);
  });
  it("one score per trick (legacy preset): no criteria table, no combine rule, no categories, no trimming, no sensor details", () => {
    const hidden = scoringMoreHidden(model(legacy));
    for (const p of ["trick.criteria", "trick.combine", "categories", "heightSensor.source", "heightSensor.mapping", "heightSensor.bonus", "heat.total.maxRaw", "modifiers.interference.value", "modifiers.dns", "modifiers.dsq"]) expect(hidden, p).toContain(p);
  });
  it("More settings drops from 53 to 21 for the legacy preset (the main dials are drawn above it)", () => {
    expect(more(model(legacy))).toBe(21);
  });
  it("several criteria (KOTA): the criteria table and how they are combined appear", () => {
    const hidden = scoringMoreHidden(model(kota));
    expect(hidden).not.toContain("trick.criteria");
    expect(hidden).not.toContain("trick.combine");
    expect(more(model(kota))).toBeGreaterThanOrEqual(more(model(legacy)) + 2);
  });
  it("best tricks per category (GKA): the categories and per-category rules appear", () => {
    const m = model(gka);
    expect(scoringMoreHidden(m)).not.toContain("categories");
    expect(more(m)).toBeGreaterThan(more(model(legacy)));
  });
  it("the height sensor's details only when it is switched on; the bonus only when it gives a bonus", () => {
    const on = model(legacy, (m) => {
      m.heightSensor = { ...m.heightSensor, enabled: true, use: "bonus" };
    });
    const hidden = scoringMoreHidden(on);
    expect(hidden).not.toContain("heightSensor.source");
    expect(hidden).not.toContain("heightSensor.bonus");
    expect(hidden).toContain("heightSensor.mapping");
  });
  it("the interference value only for a percentage or points; the largest raw total only when a percentage is shown", () => {
    const pct = model(legacy, (m) => {
      m.modifiers.interference.penalty = "percent";
      m.heat.total.display = "percent";
    });
    expect(scoringMoreHidden(pct)).not.toContain("modifiers.interference.value");
    expect(scoringMoreHidden(pct)).not.toContain("heat.total.maxRaw");
  });
});
