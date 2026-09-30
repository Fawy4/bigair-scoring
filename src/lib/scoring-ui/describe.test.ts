import { describe, expect, it } from "vitest";
import { preset } from "@/lib/engine/scoring/fixtures";
import { describePanel, describeScoringModel, panelRule } from "./describe";

describe("describeScoringModel", () => {
  it("the owner's example: Best 3 of 7 attempts + Variety 0–10, 3 judges averaged", () => {
    expect(describeScoringModel(preset("legacy-kol-best3-variety"))).toBe("Best 3 of 7 attempts + Variety 0–10, 3 judges averaged");
  });
  it("KOTA: best 3 tricks + Impression, trimmed average", () => {
    expect(describeScoringModel(preset("kota-best3-impression"))).toBe("Best 3 tricks + Impression 0–10, 3 judges trimmed average");
  });
  it("single best, no impression", () => {
    expect(describeScoringModel(preset("megaloop-single-best"))).toBe("Single best trick, 3 judges trimmed average");
  });
  it("overall impression only", () => {
    expect(describeScoringModel(preset("overall-impression"))).toBe("Judges do not score individual tricks + Heat score 0–10, 1 judge averaged");
  });
  it("categories, with the per-category dial and weights spelled out", () => {
    const m = preset("gka-category-overall", (x) => {
      if (x.heat.counting.type === "best_per_category") x.heat.counting.perCategoryMax = { kiteloop: 2, board_off: 1 };
      x.heat.countedWeights = [1, 0.75, 0.5];
    });
    expect(describeScoringModel(m)).toBe(
      "Best 1 trick per category in the best 3 categories (Kiteloop tricks up to 2, Board-off tricks up to 1; others 1), counted tricks weighted 1 / 0.75 / 0.5 + Overall score 0–10, 3 judges trimmed average",
    );
  });
  it("follows edits: n = 1 and a median panel", () => {
    const m = preset("club-quick-best2", (x) => {
      x.heat.counting = { type: "best_n", n: 1, distinctTrickNames: false };
      x.heat.maxAttemptsPerRider = 5;
      x.panel.aggregate = "median";
    });
    expect(describeScoringModel(m)).toBe("Best 1 of 5 attempts, 2 judges median");
  });
});

describe("describePanel: the judges setting in words", () => {
  const base = { minJudges: 3, maxJudges: 3, aggregate: "mean" as const, trimMinJudges: 5 };
  it("plain average", () => {
    expect(describePanel(base)).toBe("3 judges — plain average");
    expect(describePanel({ ...base, minJudges: 1, maxJudges: 1 })).toBe("1 judge — plain average");
  });
  it("trimmed with enough judges: highest and lowest dropped", () => {
    expect(describePanel({ ...base, minJudges: 5, maxJudges: 7, aggregate: "trimmed_mean" })).toBe("5 judges — highest and lowest score dropped, the rest averaged");
  });
  it("trimmed but too few judges: says the plain average is used instead", () => {
    expect(describePanel({ ...base, aggregate: "trimmed_mean" })).toBe("3 judges — plain average (trimming only starts from 5 judges, so it is not used here)");
  });
  it("trimmed with a panel that sometimes reaches the trimming size", () => {
    expect(describePanel({ ...base, maxJudges: 7, aggregate: "trimmed_mean" })).toBe("3 judges — plain average; with 5 or more judges the highest and lowest score are dropped and the rest averaged");
  });
  it("median", () => {
    expect(describePanel({ ...base, aggregate: "median" })).toBe("3 judges — the middle score (median) counts");
  });
  it("uses the preset's own trimming size", () => {
    expect(describePanel({ ...base, minJudges: 4, maxJudges: 4, aggregate: "trimmed_mean", trimMinJudges: 4 })).toBe("4 judges — highest and lowest score dropped, the rest averaged");
    expect(panelRule(5)).toBe("Trimming only applies from 5 judges. With fewer judges the plain average is used automatically.");
  });
});
