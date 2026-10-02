import { describe, expect, it } from "vitest";
import { diffOverrides, effectiveOverrides, FORMAT_NULLABLE, isEmptyOverrides, mergeOverrides, sameOverrides, SCORING_NULLABLE } from "./overrides";
import { parseScoringModel, ScoringModelSchema } from "@/lib/schemas/scoring-model";
import { preset } from "@/lib/engine/scoring/fixtures";

describe("override merge", () => {
  it("merges objects key by key and replaces arrays", () => {
    const base = { a: { x: 1, y: 2 }, list: [1, 2, 3], keep: "k" };
    expect(mergeOverrides(base, { a: { y: 9 }, list: [7] })).toEqual({ a: { x: 1, y: 9 }, list: [7], keep: "k" });
  });
  it("null removes a key, except where null is a real value", () => {
    const base = { heat: { maxAttemptsPerRider: 7, note: "n" }, entrants: { max: 36 } };
    expect(mergeOverrides(base, { heat: { maxAttemptsPerRider: null, note: null } }, SCORING_NULLABLE)).toEqual({ heat: { maxAttemptsPerRider: null }, entrants: { max: 36 } });
    expect(mergeOverrides(base, { entrants: { max: null } }, FORMAT_NULLABLE)).toEqual({ heat: { maxAttemptsPerRider: 7, note: "n" }, entrants: { max: null } });
  });
  it("no overrides → the base itself", () => {
    const base = { a: 1 };
    expect(mergeOverrides(base, {})).toBe(base);
    expect(mergeOverrides(base, undefined)).toBe(base);
  });
});

describe("override diff", () => {
  it("stores only what changed", () => {
    expect(diffOverrides({ a: { x: 1, y: 2 }, b: 1 }, { a: { x: 1, y: 3 }, b: 1 })).toEqual({ a: { y: 3 } });
    expect(isEmptyOverrides(diffOverrides({ a: 1 }, { a: 1 }))).toBe(true);
  });
  it("marks removed keys with null", () => {
    expect(diffOverrides({ a: 1, b: 2 }, { a: 1 })).toEqual({ b: null });
  });
  it("a changed `type` stores the whole object", () => {
    const d = diffOverrides({ heat: { counting: { type: "best_n", n: 3 } } }, { heat: { counting: { type: "single_best" } } });
    expect(d).toEqual({ heat: { counting: { type: "single_best" } } });
  });
  it("round trip: merge(base, diff(base, edited)) = edited, on a real scoring model", () => {
    const base = parseScoringModel(structuredClone(preset("legacy-kol-best3-variety")));
    const edited = structuredClone(base);
    edited.heat.maxAttemptsPerRider = null; // "no cap" is a real value
    edited.heat.counting = { type: "best_n", n: 4, distinctTrickNames: false };
    edited.heat.impression = null;
    edited.panel.minJudges = 4;
    edited.tieBreakers = ["most_landed", "head_judge"];
    edited.categories.splice(0, 1);
    const overrides = diffOverrides(base, edited, SCORING_NULLABLE);
    expect(overrides).toMatchObject({ heat: { maxAttemptsPerRider: null, impression: null, counting: { n: 4 } }, panel: { minJudges: 4 }, tieBreakers: ["most_landed", "head_judge"] });
    const merged = ScoringModelSchema.parse(mergeOverrides(base, overrides, SCORING_NULLABLE));
    expect(merged.heat.maxAttemptsPerRider).toBeNull();
    expect(merged.heat.impression).toBeNull();
    expect(merged.heat.counting).toEqual({ type: "best_n", n: 4, distinctTrickNames: false });
    expect(merged.panel.minJudges).toBe(4);
  });
  it("removing an optional field survives the round trip", () => {
    const base = parseScoringModel(structuredClone(preset("gka-category-overall")));
    const edited = structuredClone(base);
    if (edited.heat.counting.type === "best_per_category") delete edited.heat.counting.categoriesCounted;
    const overrides = diffOverrides(base, edited, SCORING_NULLABLE);
    const merged = ScoringModelSchema.parse(mergeOverrides(base, overrides, SCORING_NULLABLE));
    expect(merged.heat.counting.type === "best_per_category" && merged.heat.counting.categoriesCounted).toBeUndefined();
  });
});

describe("effectiveOverrides (no phantom Unsaved changes)", () => {
  it("drops a saved override that equals the base's own value", () => {
    const base = { heat: { maxAttemptsPerRider: 7, duplicateWindowSec: 20 } };
    const saved = { heat: { maxAttemptsPerRider: 7 } };
    const merged = mergeOverrides(base, saved);
    const eff = effectiveOverrides(base, saved, merged);
    expect(eff).toEqual({});
    // nothing touched: the screen's own diff is the same, so it is not "unsaved"
    expect(sameOverrides(diffOverrides(base, merged), eff)).toBe(true);
  });
  it("keeps a saved override that really changes something", () => {
    const base = { heat: { maxAttemptsPerRider: 7 } };
    const saved = { heat: { maxAttemptsPerRider: 5 } };
    expect(effectiveOverrides(base, saved, mergeOverrides(base, saved))).toEqual({ heat: { maxAttemptsPerRider: 5 } });
  });
  it("falls back to the saved overrides when there is no base", () => {
    expect(effectiveOverrides(null, { a: 1 }, null)).toEqual({ a: 1 });
  });
});
