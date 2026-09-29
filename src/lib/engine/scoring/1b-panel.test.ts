import { describe, expect, it } from "vitest";
import { panelScore } from "./index";
import { preset } from "./fixtures";
import type { ScoringModel } from "@/lib/schemas/scoring-model";

// doc 08 §1B — judge aggregation.
function withAggregate(aggregate: ScoringModel["panel"]["aggregate"]) {
  return preset("kota-best3-impression", (m) => {
    m.panel.aggregate = aggregate;
    m.panel.trimMinJudges = 5;
  });
}

function scores(values: number[]) {
  const judges = values.map((_, i) => `J${i + 1}`);
  return { judges, scores: values.map((score, i) => ({ judgeId: judges[i], score })) };
}

function run(aggregate: ScoringModel["panel"]["aggregate"], values: number[]) {
  const { judges, scores: s } = scores(values);
  return panelScore(withAggregate(aggregate), s, judges);
}

describe("1B — panel aggregation", () => {
  it("trimmed mean, 5 judges: drop 7.0 and 9.5 → 7.83", () => {
    const p = run("trimmed_mean", [7.0, 7.5, 8.0, 8.0, 9.5]);
    expect(p.score).toBe(7.83);
    expect(p.judgeScores.filter((j) => j.trimmed).map((j) => j.score).sort()).toEqual([7.0, 9.5]);
  });

  it("same 5 marks with mean → 8.00", () => {
    expect(run("mean", [7.0, 7.5, 8.0, 8.0, 9.5]).score).toBe(8.0);
  });

  it("trimmed mean, 4 judges → below threshold → plain mean 8.00", () => {
    const p = run("trimmed_mean", [7.0, 7.5, 8.0, 9.5]);
    expect(p.score).toBe(8.0);
    expect(p.judgeScores.some((j) => j.trimmed)).toBe(false);
  });

  it("trimmed mean, 3 judges → plain mean 8.17", () => {
    expect(run("trimmed_mean", [7.0, 8.0, 9.5]).score).toBe(8.17);
  });

  it("median, odd count → middle value 8.00", () => {
    expect(run("median", [7.0, 7.5, 8.0, 8.0, 9.5]).score).toBe(8.0);
  });

  it("median, even count → average of two middles 8.50", () => {
    expect(run("median", [7.0, 8.0, 9.0, 9.5]).score).toBe(8.5);
  });

  it("outlier flag when two judges differ by more than outlierWarnPct of the range", () => {
    // KOTA: 15% of 0–10 = 1.5
    expect(run("mean", [7.0, 8.5]).outlier).toBe(false);
    expect(run("mean", [7.0, 8.6]).outlier).toBe(true);
  });

  it("rounds half-up without floating-point surprises", () => {
    // 1.005 is stored as 1.00499999…; half-up must still give 1.01
    expect(run("mean", [1.005]).score).toBe(1.01);
  });
});
