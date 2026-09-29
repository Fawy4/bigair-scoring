import { describe, expect, it } from "vitest";
import { computeHeat, judgeTrickScore, mapHeight, maxRawFor, ScoringInputError } from "./index";
import { crashed, hetx, impressions, J3, landed, preset, same } from "./fixtures";
import type { PresetId } from "./fixtures";
import type { RiderInput } from "./types";

// doc 08 §1F — other edge cases.
const one = (model: Parameters<typeof computeHeat>[0], rider: RiderInput, judges = J3) =>
  computeHeat(model, { panelJudgeIds: judges, riders: [rider] }).riders[0];

describe("1F — edge cases", () => {
  it("2 landed attempts (8.0, 7.0) under best 3 → tricks 15.00", () => {
    const m = preset("club-quick-best2", (x) => {
      x.heat.counting = { type: "best_n", n: 3, distinctTrickNames: false };
    });
    const r = one(m, { riderId: "R", attempts: [landed(1, same(8)), landed(2, same(7))] });
    expect(r.components.tricks).toBe(15.0);
  });

  it("crash = zero: landed 8.0 + one crash under best 3 → counted [8.0, 0] = 8.00", () => {
    const m = preset("club-quick-best2", (x) => {
      x.heat.counting = { type: "best_n", n: 3, distinctTrickNames: false };
      x.trick.crash = "zero";
    });
    const r = one(m, { riderId: "R", attempts: [crashed(1), landed(2, same(8))] });
    expect(r.counted.map((c) => [c.attemptSeq, c.score])).toEqual([[2, 8], [1, 0]]);
    expect(r.total).toBe(8.0);
  });

  it("crash = zero never displaces a landed trick, even a landed 0", () => {
    const m = preset("club-quick-best2", (x) => {
      x.heat.counting = { type: "best_n", n: 1, distinctTrickNames: false };
      x.trick.crash = "zero";
    });
    const r = one(m, { riderId: "R", attempts: [crashed(1), landed(2, same(0))] });
    expect(r.counted.map((c) => c.attemptSeq)).toEqual([2]);
  });

  it("best_per_category, maxPerCategory 1: kiteloop 8.4 & 8.9, board_off 7.2 → 16.10", () => {
    const m = preset("gka-category-overall", (x) => {
      x.heat.impression = null;
    });
    const k = (v: number) => J3.map(() => hetx(v, v, v, v));
    const r = one(m, {
      riderId: "R",
      attempts: [
        landed(1, k(8.4), { categoryKey: "kiteloop" }),
        landed(2, k(8.9), { categoryKey: "kiteloop" }),
        landed(3, k(7.2), { categoryKey: "board_off" }),
      ],
    });
    expect(r.counted.map((c) => [c.attemptSeq, c.categoryKey])).toEqual([[2, "kiteloop"], [3, "board_off"]]);
    expect(r.components.tricks).toBe(16.1);
  });

  it("overall-impression preset: judges 7.5, 8.0, 7.0 → 7.50", () => {
    const r = one(preset("overall-impression"), { riderId: "R", attempts: [], impressionMarks: impressions([7.5, 8.0, 7.0]) });
    expect(r.total).toBe(7.5);
  });

  it("impression entered before any trick → total = impression only", () => {
    const r = one(preset("kota-best3-impression"), { riderId: "R", attempts: [], impressionMarks: impressions([6, 6, 6]) });
    expect(r.total).toBe(6.0);
  });

  describe("height sensor as the Height criterion (linear 5 m → 0, 25 m → 10)", () => {
    const m = preset("kota-best3-impression", (x) => {
      x.heightSensor.enabled = true;
      x.heightSensor.use = "height_criterion";
    });
    const mapping = m.heightSensor.mapping!;
    const scale = m.trick.criteria[0].scale;

    it("15 m → 5.00, 30 m clamps to 10.00, 3 m clamps to 0.00", () => {
      expect(mapHeight(mapping, 15, scale)).toBe(5);
      expect(mapHeight(mapping, 30, scale)).toBe(10);
      expect(mapHeight(mapping, 3, scale)).toBe(0);
    });

    it("fills Height = 5.00 for every judge (overriding what they typed)", () => {
      const r = one(m, {
        riderId: "R",
        attempts: [landed(1, [hetx(9, 8, 8, 8), hetx(1, 8, 8, 8), { extremity: 8, technicality: 8, execution: 8 }], { heightM: 15 })],
      });
      for (const j of r.allAttempts[0].panel!.judgeScores) {
        expect(j.detail?.criteria?.find((c) => c.key === "height")).toEqual({ key: "height", value: 5, source: "sensor" });
        expect(j.score).toBeCloseTo(7.25, 10);
      }
    });

    it("no reading → judge's own Height mark is used and the attempt is flagged", () => {
      const r = one(m, { riderId: "R", attempts: [landed(1, same(0).map(() => hetx(6, 8, 8, 8)))] });
      expect(r.allAttempts[0].panel?.score).toBe(7.5);
      expect(r.allAttempts[0].sensorMissing).toBe(true);
      expect(r.flags.sensorMissing).toEqual([1]);
    });
  });

  it("value not on step (8.55 on step 0.1) → engine throws", () => {
    const m = preset("kota-best3-impression");
    expect(() => judgeTrickScore(m, hetx(8.55, 8, 8, 8))).toThrow(ScoringInputError);
    expect(() => judgeTrickScore(m, hetx(10.1, 8, 8, 8))).toThrow(/outside/);
    expect(() => judgeTrickScore(m, hetx(8.5, 8, 8, 8))).not.toThrow();
  });

  it.each<[PresetId, number | null]>([
    ["kota-best3-impression", 40],
    ["pukl-points", 30],
    ["megaloop-single-best", 10],
    ["club-quick-best2", 20],
    ["overall-impression", 10],
    ["legacy-kol-best3-variety", 40],
    ["gka-category-overall", 40],
  ])('maxRaw "auto" for %s → %s', (id, expected) => {
    expect(maxRawFor(preset(id))).toBe(expected);
  });

  it('maxRaw for counting "all": attempt cap × trick max, or null (no percentage) without a cap', () => {
    const all = preset("club-quick-best2", (x) => {
      x.heat.counting = { type: "all" };
    });
    expect(maxRawFor(all)).toBeNull();
    all.heat.maxAttemptsPerRider = 7;
    expect(maxRawFor(all)).toBe(70);
  });

  describe("distinctTrickNames (single marks, step 0.1)", () => {
    const names = [
      ["Left Backroll Board Off Handle", 6.3],
      ["left  backroll board off handle", 5.3],
      ["Left x2 Backroll", 4.0],
      ["Right Frontroll", 3.5],
    ] as const;
    const build = (distinct: boolean) =>
      preset("legacy-kol-best3-variety", (x) => {
        x.trick.scale.step = 0.1;
        x.heat.impression = null;
        x.heat.counting = { type: "best_n", n: 3, distinctTrickNames: distinct };
      });
    const rider: RiderInput = {
      riderId: "R",
      attempts: names.map(([trickName, v], i) => landed(i + 1, [v], { trickName }, ["J1"])),
    };

    it("on → 6.3 + 4.0 + 3.5 = 13.80", () => {
      expect(one(build(true), rider, ["J1"]).components.tricks).toBe(13.8);
    });

    it("off → 6.3 + 5.3 + 4.0 = 15.60", () => {
      expect(one(build(false), rider, ["J1"]).components.tricks).toBe(15.6);
    });
  });

  it("interference drop_best_trick on a rider with one counted trick → tricks 0, total never negative", () => {
    const m = preset("club-quick-best2");
    const r = one(m, { riderId: "R", attempts: [landed(1, same(8))], modifiers: [{ type: "INT" }] });
    expect(r.counted).toEqual([]);
    expect(r.total).toBe(0);
  });

  it("points penalty cannot push a total below 0 (decision 5)", () => {
    const m = preset("overall-impression");
    const r = one(m, { riderId: "R", attempts: [], impressionMarks: impressions([0.5, 0.5, 0.5]), modifiers: [{ type: "INT" }] });
    expect(r.unroundedTotal).toBeCloseTo(-0.5, 10);
    expect(r.total).toBe(0);
  });

  it("DNF with keepScores keeps scores; without, total 0", () => {
    const rider: RiderInput = { riderId: "R", attempts: [landed(1, same(8))], modifiers: [{ type: "DNF" }] };
    expect(one(preset("club-quick-best2"), rider).total).toBe(8);
    const lose = preset("club-quick-best2", (x) => {
      x.modifiers.dnf.keepScores = false;
    });
    expect(one(lose, rider).total).toBe(0);
  });

  it("legacy preset sanity check: best 3 = 13.0, Variety 4.3, total 17.3 (1 decimal), counter 7 / 7", () => {
    const m = preset("legacy-kol-best3-variety");
    // Judge marks on step 0.5 whose means round (1 dp) to 4.7, 4.3, 4.0, 3.5, 2.8.
    const r = one(m, {
      riderId: "R",
      attempts: [
        landed(1, [4.5, 5.0, 4.5]),
        crashed(2),
        landed(3, [4.5, 4.0, 4.5]),
        landed(4, [4.0, 4.0, 4.0]),
        crashed(5),
        landed(6, [3.5, 3.5, 3.5]),
        landed(7, [3.0, 2.5, 3.0]),
      ],
      impressionMarks: impressions([4.5, 4.0, 4.5]),
    });
    expect(r.allAttempts.filter((a) => a.status === "landed").map((a) => a.panel?.score)).toEqual([4.7, 4.3, 4.0, 3.5, 2.8]);
    expect(r.components.tricks).toBe(13.0);
    expect(r.components.impression).toBe(4.3);
    expect(r.total).toBe(17.3);
    expect(r.totalLabel).toBe("17.3");
    expect(r.allAttempts.filter((a) => a.status === "crashed").every((a) => !a.counted)).toBe(true);
    expect([r.attemptCount, r.attemptCap]).toEqual([7, 7]);
  });
  it("percent interference penalty (Megaloop 10%): 8.37 → −0.84 → 7.53", () => {
    const m = preset("megaloop-single-best");
    const e = (v: number) => ({ extremity: v, trick: v, style: v, landing: v });
    const r = one(m, { riderId: "R", attempts: [landed(1, [e(8.4), e(8.3), e(8.4)])], modifiers: [{ type: "INT" }] });
    expect(r.components.tricks).toBe(8.37);
    expect(r.components.penalty).toBe(0.84);
    expect(r.total).toBe(7.53);
  });

  it("height bonus: 0.5 per metre above 10 m, capped at 2 points", () => {
    const m = preset("club-quick-best2", (x) => {
      x.heightSensor = { ...x.heightSensor, enabled: true, use: "bonus", bonus: { perMetreAbove: 0.5, thresholdM: 10, capPoints: 2 } };
    });
    const at = (h: number) => one(m, { riderId: "R", attempts: [landed(1, same(8), { heightM: h })] });
    expect(at(13).components.bonus).toBe(1.5);
    expect(at(13).total).toBe(9.5);
    expect(at(20).components.bonus).toBe(2);
    expect(at(8).components.bonus).toBe(0);
    expect(maxRawFor(m)).toBe(22);
  });
});
