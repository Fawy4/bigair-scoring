import { describe, expect, it } from "vitest";
import { computeHeat, explain, maxRawFor, computeRider } from "./index";
import { hetx, impressions, J3, landed, preset, same } from "./fixtures";
import { ScoringModelSchema, type ScoringModel } from "@/lib/schemas/scoring-model";
import type { Attempt, RiderInput } from "./types";

// doc 03 §10 item 16 and decisions 5–7 in docs/06 §12: two optional dials, absent = unchanged behaviour.
// Every judge gives the same value on all four criteria, so the trick score = that value.

const trick = (seq: number, v: number, categoryKey?: string): Attempt =>
  landed(seq, J3.map(() => hetx(v, v, v, v)), categoryKey ? { categoryKey } : {});

function perCategoryModel(edit?: (m: ScoringModel) => void): ScoringModel {
  return preset("gka-category-overall", (m) => {
    m.heat.impression = null; // isolate the tricks component
    if (m.heat.counting.type === "best_per_category") m.heat.counting.perCategoryMax = { kiteloop: 2, board_off: 1 };
    edit?.(m);
  });
}

function bestNModel(edit?: (m: ScoringModel) => void): ScoringModel {
  return preset("kota-best3-impression", (m) => {
    m.heat.impression = null;
    m.heat.countedWeights = [1, 0.75, 0.5];
    edit?.(m);
  });
}

const one = (m: ScoringModel, r: RiderInput) => computeRider(m, r, J3);

describe("dial 1 — counting.perCategoryMax (doc 03 item 16)", () => {
  const rider: RiderInput = {
    riderId: "R",
    attempts: [
      trick(1, 8.9, "kiteloop"),
      trick(2, 8.4, "kiteloop"),
      trick(3, 7.0, "kiteloop"),
      trick(4, 7.2, "board_off"),
      trick(5, 6.0, "board_off"),
    ],
  };

  it("kiteloops 8.9/8.4/7.0 + board-offs 7.2/6.0 with {kiteloop: 2, board_off: 1} → 8.9 + 8.4 + 7.2 = 24.50", () => {
    const r = one(perCategoryModel(), rider);
    expect(r.counted.map((c) => c.score)).toEqual([8.9, 8.4, 7.2]);
    expect(r.components.tricks).toBe(24.5);
    expect(r.total).toBe(24.5);
  });

  it("a category not named in the map keeps maxPerCategory (rotation → 1)", () => {
    const withRotation: RiderInput = {
      riderId: "R",
      attempts: [...rider.attempts, trick(6, 6.5, "rotation"), trick(7, 6.4, "rotation")],
    };
    const r = one(perCategoryModel(), withRotation);
    expect(r.counted.map((c) => c.score)).toEqual([8.9, 8.4, 7.2, 6.5]);
  });

  it("absent map = today's behaviour (1 per category)", () => {
    const m = perCategoryModel((x) => {
      if (x.heat.counting.type === "best_per_category") delete x.heat.counting.perCategoryMax;
    });
    expect(one(m, rider).counted.map((c) => c.score)).toEqual([8.9, 7.2]);
  });

  it("interference drops the best kiteloop; the next one takes its slot", () => {
    const r = one(perCategoryModel(), { ...rider, modifiers: [{ type: "INT" }] });
    expect(r.counted.map((c) => c.score)).toEqual([8.4, 7.2, 7.0]);
    expect(r.total).toBe(22.6);
  });

  it("the keys must be category keys of the model", () => {
    const bad = structuredClone(preset("gka-category-overall")) as unknown as Record<string, unknown>;
    (bad.heat as { counting: Record<string, unknown> }).counting.perCategoryMax = { kiteloops: 2 };
    const res = ScoringModelSchema.safeParse(bad);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.error?.issues)).toContain("kiteloops");
  });

  it("each limit must be a whole number ≥ 1", () => {
    const bad = structuredClone(preset("gka-category-overall")) as unknown as Record<string, unknown>;
    (bad.heat as { counting: Record<string, unknown> }).counting.perCategoryMax = { kiteloop: 0 };
    expect(ScoringModelSchema.safeParse(bad).success).toBe(false);
  });
});

describe("dial 2 — heat.countedWeights (doc 03 item 16)", () => {
  const rider: RiderInput = { riderId: "R", attempts: [trick(1, 8.0), trick(2, 7.0), trick(3, 6.0), trick(4, 5.0)] };

  it("[1, 0.75, 0.5] on counted 8.0 / 7.0 / 6.0 → 8.0 + 5.25 + 3.0 = 16.25", () => {
    const r = one(bestNModel(), rider);
    expect(r.counted.map((c) => c.score)).toEqual([8, 7, 6]);
    expect(r.components.tricks).toBe(16.25);
    expect(r.total).toBe(16.25);
  });

  it("missing entries count as 1", () => {
    const r = one(bestNModel((m) => (m.heat.countedWeights = [0.5])), rider);
    expect(r.total).toBe(4 + 7 + 6);
  });

  it("weights are applied before trickWeight", () => {
    const r = one(bestNModel((m) => (m.heat.trickWeight = 2)), rider);
    expect(r.total).toBe(32.5);
  });

  it("absent weights = unchanged", () => {
    const r = one(bestNModel((m) => delete m.heat.countedWeights), rider);
    expect(r.total).toBe(21);
  });

  it("negative weights are refused", () => {
    const bad = structuredClone(preset("kota-best3-impression")) as unknown as { heat: Record<string, unknown> };
    bad.heat.countedWeights = [1, -0.5];
    expect(ScoringModelSchema.safeParse(bad).success).toBe(false);
  });

  it("explain() shows each multiplication", () => {
    const m = bestNModel();
    const text = explain(one(m, rider), m).join("\n");
    expect(text).toContain("8.00 × 1 = 8.00");
    expect(text).toContain("7.00 × 0.75 = 5.25");
    expect(text).toContain("6.00 × 0.5 = 3.00");
    expect(text).toContain("16.25");
  });
});

describe("decision 6 — interference 'drop best trick' then re-weight", () => {
  it("best trick (8.0) dropped, then [1, 0.75, 0.5] re-applied in rank order to 7.0 / 6.0 / 5.0 = 7 + 4.5 + 2.5 = 14.00", () => {
    const m = bestNModel();
    const r = one(m, {
      riderId: "R",
      attempts: [trick(1, 8.0), trick(2, 7.0), trick(3, 6.0), trick(4, 5.0)],
      modifiers: [{ type: "INT" }],
    });
    expect(r.counted.map((c) => c.score)).toEqual([7, 6, 5]);
    expect(r.components.tricks).toBe(16.25); // before the drop
    expect(r.components.penalty).toBe(2.25);
    expect(r.total).toBe(14);
  });
});

describe("decision 7 — tie-breakers compare RAW scores, never weighted ones", () => {
  // A weight of 0 makes the difference visible: on weighted values the riders look identical.
  it("highest_counted_trick reads raw 8.0 vs 7.0 although both weighted to 0", () => {
    const m = bestNModel((x) => {
      x.heat.countedWeights = [0, 1];
      x.heat.counting = { type: "best_n", n: 2, distinctTrickNames: false };
      x.tieBreakers = ["highest_counted_trick", "head_judge"];
    });
    const res = computeHeat(m, {
      panelJudgeIds: J3,
      riders: [
        { riderId: "B", attempts: [trick(1, 7.0), trick(2, 6.0)] },
        { riderId: "A", attempts: [trick(1, 8.0), trick(2, 6.0)] },
      ],
    });
    expect(res.riders.map((r) => r.total)).toEqual([6, 6]);
    expect(res.riders[0].counted.map((c) => c.score)).toEqual([7, 6]); // raw, not 0
    expect(res.ranking.map((r) => [r.riderId, r.place])).toEqual([["A", 1], ["B", 2]]);
    expect(res.ranking[0].tieResolvedBy).toBe("highest_counted_trick");
  });

  it("next_counted_trick reads raw 7.5 vs 7.0 although both weighted to 0", () => {
    const m = bestNModel((x) => {
      x.heat.countedWeights = [1, 0, 1];
      x.heat.counting = { type: "best_n", n: 3, distinctTrickNames: false };
      x.tieBreakers = ["highest_counted_trick", "next_counted_trick", "head_judge"];
    });
    const res = computeHeat(m, {
      panelJudgeIds: J3,
      riders: [
        { riderId: "B", attempts: [trick(1, 9.0), trick(2, 7.0), trick(3, 4.0)] },
        { riderId: "A", attempts: [trick(1, 9.0), trick(2, 7.5), trick(3, 4.0)] },
      ],
    });
    expect(res.riders.map((r) => r.total)).toEqual([13, 13]);
    expect(res.ranking.map((r) => r.riderId)).toEqual(["A", "B"]);
    expect(res.ranking[0].tieResolvedBy).toBe("next_counted_trick");
  });

  it("weights change only the total: a lower-scoring-on-paper rider can lead on weighted total", () => {
    const m = bestNModel((x) => {
      x.heat.countedWeights = [0.5, 1];
      x.heat.counting = { type: "best_n", n: 2, distinctTrickNames: false };
    });
    const res = computeHeat(m, {
      panelJudgeIds: J3,
      riders: [
        { riderId: "A", attempts: [trick(1, 8.0), trick(2, 6.0)] }, // 4 + 6 = 10
        { riderId: "B", attempts: [trick(1, 7.0), trick(2, 6.5)] }, // 3.5 + 6.5 = 10
      ],
    });
    expect(res.riders.map((r) => r.total)).toEqual([10, 10]);
  });
});

describe("decision 5 — automatic maximum with the dials", () => {
  it("perCategoryMax {kiteloop 2, board_off 1}, rotation defaults to 1 → 4 slots × 10 = 40 (+10 impression = 50)", () => {
    const m = perCategoryModel();
    expect(maxRawFor(m)).toBe(40);
    m.heat.impression = preset("gka-category-overall").heat.impression;
    expect(maxRawFor(m)).toBe(50);
  });

  it("without the dial the GKA maximum is unchanged: 3 × 10 + 10 = 40", () => {
    expect(maxRawFor(preset("gka-category-overall"))).toBe(40);
  });

  it("categoriesCounted smaller than the categories: the best possible combination of limits", () => {
    const m = perCategoryModel((x) => {
      if (x.heat.counting.type === "best_per_category") {
        x.heat.counting.perCategoryMax = { kiteloop: 3, board_off: 2, rotation: 1 };
        x.heat.counting.categoriesCounted = 2;
      }
    });
    expect(maxRawFor(m)).toBe(50); // 3 + 2 slots
  });

  it("countedWeights [1, 0.75, 0.5] on best 3 → (1 + 0.75 + 0.5) × 10 = 22.5", () => {
    expect(maxRawFor(bestNModel())).toBe(22.5);
  });

  it("missing weights = 1: [0.5] on best 3 → 0.5 + 1 + 1 = 2.5 × 10", () => {
    expect(maxRawFor(bestNModel((m) => (m.heat.countedWeights = [0.5])))).toBe(25);
  });

  it("extra weights beyond the counted slots are ignored", () => {
    expect(maxRawFor(bestNModel((m) => (m.heat.countedWeights = [1, 1, 1, 0])))).toBe(30);
  });

  it("a rider with the maximum reaches 100 %", () => {
    const m = bestNModel((x) => (x.heat.total.display = "both"));
    const r = one(m, { riderId: "R", attempts: [trick(1, 10), trick(2, 10), trick(3, 10)] });
    expect(r.total).toBe(22.5);
    expect(r.percent).toBe(100);
  });

  it("weights also apply to the maximum with an impression (weight 1, max 10)", () => {
    const m = bestNModel((x) => (x.heat.impression = preset("kota-best3-impression").heat.impression));
    expect(maxRawFor(m)).toBe(22.5 + 10 * (m.heat.impression?.weight ?? 0));
  });
});

describe("absent dials change nothing", () => {
  it("KOTA best-3 with impression still adds up as before", () => {
    const m = preset("kota-best3-impression");
    const res = computeHeat(m, {
      panelJudgeIds: J3,
      riders: [{ riderId: "R", attempts: [trick(1, 8), trick(2, 7), trick(3, 6)], impressionMarks: impressions(same(7)) }],
    });
    expect(res.riders[0].components.tricks).toBe(21);
  });
});
