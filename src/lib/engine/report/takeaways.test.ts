import { describe, expect, it } from "vitest";
import { buildRiderReport } from "./build";
import { aggregate, everyone, indexOf, riderHeats } from "./collect";
import { att, ctxOf, heat, R1_ADVANCE, res, round, RULES } from "./fixture";
import { strengthOf, trainOf } from "./takeaways";
import type { DivisionRules, ReportAttempt, ReportContext, ReportResult } from "./types";

type A = ReportAttempt;
/** One heat of Round 1: rider `a` against rider `b` (b wins unless `aWins`). Totals follow the counted tricks unless set. */
const H = (n: number, a: A[], b: A[], o: { aWins?: boolean; aTotal?: number; bTotal?: number; duration?: number } = {}) => {
  const ra: ReportResult = res("a", o.aWins ? 1 : 2, a, o.aTotal !== undefined ? { total: o.aTotal } : {});
  const rb: ReportResult = res("b", o.aWins ? 2 : 1, b, o.bTotal !== undefined ? { total: o.bTotal } : {});
  return heat(n, o.aWins ? [ra, rb] : [rb, ra], { duration_sec: o.duration ?? 600, id: `heat-${n}` });
};
const make = (heats: ReturnType<typeof H>[], rules: Partial<DivisionRules> = {}, advance = R1_ADVANCE): ReportContext => ctxOf([round("R1", "Round 1", 1, heats, advance)], { rules });
const lands = (n: number, o: Partial<A> = {}): A[] => Array.from({ length: n }, (_, i) => att(i + 1, { score: 5, at: (i + 1) * 50, ...o }));
const crashes = (from: number, n: number, o: Partial<A> = {}): A[] => Array.from({ length: n }, (_, i) => att(from + i, { status: "crashed", at: (from + i) * 50, ...o }));
const take = (ctx: ReportContext, id = "a") => {
  const r = buildRiderReport(ctx, id);
  if (r.status !== "ok") throw new Error("no report");
  return r.takeaways;
};
const aggs = (ctx: ReportContext) => {
  const idx = indexOf(ctx);
  const all = [...everyone(ctx, idx).values()];
  return { me: all.find((x) => x.entryId === "a")!, all, rules: ctx.divisionRules.div, aggOf: (id: string) => aggregate(id, riderHeats(ctx, id, idx)) };
};

describe("report: strengths (item 4d), the first that applies in the order of the brief", () => {
  it("landing rate at least 8 points above the field", () => {
    const ctx = make([H(1, [...lands(6), ...crashes(7, 4)], [...lands(4), ...crashes(5, 6)])]);
    // Ana lands 60%, the field (Ana and Ben) 50%
    expect(take(ctx).strength).toMatchObject({ code: "landing_rate", n: 60, m: 50 });
  });
  it("not when it is only 5 points above", () => {
    const ctx = make([H(1, [...lands(5), ...crashes(6, 5)], [...lands(4), ...crashes(5, 6)])]);
    expect(take(ctx).strength?.code).not.toBe("landing_rate");
  });
  it("two or more loops landed", () => {
    const ctx = make([H(1, [att(1, { kind: "kiteloop", score: 5 }), att(2, { kind: "megaloop", score: 5 }), att(3, { kind: "backroll", status: "crashed" })], [att(1, { kind: "kiteloop" }), att(2, { kind: "megaloop" }), att(3, { kind: "backroll", status: "crashed" })])]);
    expect(take(ctx).strength).toMatchObject({ code: "loops", n: 2, m: 2 });
  });
  it("more different tricks per heat than the field", () => {
    const ctx = make([H(1, [att(1, { kind: "backroll" }), att(2, { kind: "frontroll" }), att(3, { kind: "jump" }), att(4, { status: "crashed" }), att(5, { status: "crashed" }), att(6, { status: "crashed" })], [att(1, { kind: "backroll" }), att(2, { kind: "backroll" }), att(3, { kind: "backroll" }), att(4, { kind: "backroll" })])]);
    expect(take(ctx).strength).toMatchObject({ code: "variety_per_heat", n: 3, m: 2 }.valueOf());
  });
  it("a trick landed in both directions", () => {
    const ctx = make([H(1, [att(1, { kind: "backroll", side: "left" }), att(2, { kind: "backroll", side: "right" }), att(3, { status: "crashed" }), att(4, { status: "crashed" })], [att(1, { kind: "backroll" }), att(2, { kind: "frontroll" }), att(3, { kind: "jump" }), att(4, { kind: "kiteloop", status: "crashed" })])]);
    expect(take(ctx).strength).toMatchObject({ code: "both_sides", trick: "Backroll" });
  });
  it("growth from his first heat to his last", () => {
    const ctx = make([
      H(1, [att(1, { kind: "backroll" }), att(2, { kind: "frontroll", status: "crashed" })], [att(1, { kind: "backroll" }), att(2, { kind: "frontroll" })], { aTotal: 8, bTotal: 9 }),
      H(2, [att(1, { kind: "backroll" }), att(2, { kind: "frontroll", status: "crashed" })], [att(1, { kind: "backroll" }), att(2, { kind: "frontroll" })], { aTotal: 11, bTotal: 9 }),
    ]);
    expect(take(ctx).strength).toMatchObject({ code: "growth", n: 8, m: 11 });
  });
  it("every attempt used, in every heat, when the division has a limit", () => {
    const six = (st: "landed" | "crashed") => Array.from({ length: 3 }, (_, i) => att(i + 1, { kind: "backroll", status: st }));
    const ctx = make([H(1, [...six("landed"), ...six("crashed").map((a) => ({ ...a, seq: a.seq + 3 }))], [...six("landed"), ...six("crashed").map((a) => ({ ...a, seq: a.seq + 3 }))])], { attemptCap: 6 });
    expect(take(ctx).strength).toMatchObject({ code: "every_attempt", n: 6, m: 1 });
  });
  it("without a limit there is no 'every attempt used'; with nothing to praise there is no strength", () => {
    const ctx = make([H(1, [att(1, { kind: "backroll", status: "crashed" })], [att(1, { kind: "backroll" })])], { attemptCap: null });
    expect(take(ctx).strength).toBeNull();
  });
  it("the order of the brief decides when several apply: landing rate before loops", () => {
    const ctx = make([H(1, [att(1, { kind: "kiteloop" }), att(2, { kind: "megaloop" })], [att(1, { kind: "backroll", status: "crashed" }), att(2, { kind: "backroll", status: "crashed" })])]);
    expect(take(ctx).strength?.code).toBe("landing_rate");
  });
  it("strengthOf can be used on its own for the judges' compare page", () => {
    const { me, all, rules } = aggs(make([H(1, [att(1, { kind: "kiteloop" }), att(2, { kind: "megaloop" })], [att(1, { kind: "kiteloop" }), att(2, { kind: "megaloop" })])]));
    expect(strengthOf(me, all, rules)?.code).toBe("loops");
  });
});

describe("report: what to train (item 4d), the first that applies in the order of the brief", () => {
  it("a trick tried at least twice and never landed", () => {
    const ctx = make([H(1, [att(1, { kind: "frontroll", status: "crashed" }), att(2, { kind: "frontroll", status: "crashed" }), att(3, { kind: "backroll" })], [att(1, { kind: "backroll" })])]);
    expect(take(ctx).train).toMatchObject({ code: "never_landed", n: 2, trick: "Frontroll" });
  });
  it("tried twice and landed once is not 'never landed'; tried once is not enough", () => {
    const ctx = make([H(1, [att(1, { kind: "frontroll", status: "crashed" }), att(2, { kind: "frontroll" }), att(3, { kind: "jump", status: "crashed" })], [att(1, { kind: "backroll" })])]);
    expect(take(ctx).train?.code).not.toBe("never_landed");
  });
  it("the same trick spelled two ways counts as one trick when it is never landed", () => {
    const ctx = make([H(1, [att(1, { kind: "backroll2BoardOff", status: "crashed" }), att(2, { kind: "boardOffBackroll2", status: "crashed" }), att(3, { kind: "jump" })], [att(1, { kind: "backroll" })])]);
    expect(take(ctx).train).toMatchObject({ code: "never_landed", n: 2 });
  });
  it("loops landed less than half the time", () => {
    const ctx = make([H(1, [att(1, { kind: "kiteloop", status: "crashed" }), att(2, { kind: "megaloop", status: "crashed" }), att(3, { kind: "kiteloop" })], [att(1, { kind: "backroll" })])]);
    expect(take(ctx).train).toMatchObject({ code: "loops_half", n: 1, m: 3 });
  });
  it("exactly half is not 'less than half'", () => {
    const ctx = make([H(1, [att(1, { kind: "kiteloop", status: "crashed" }), att(2, { kind: "megaloop" })], [att(1, { kind: "backroll" })])]);
    expect(take(ctx).train?.code).not.toBe("loops_half");
  });
  it("no loops at all when the finalists' jumps include loops", () => {
    const finalists = [{ ...H(1, [att(1, { kind: "backroll" }), att(2, { kind: "frontroll" })], [att(1, { kind: "kiteloop" }), att(2, { kind: "backroll" })]), id: "heat-1" }];
    const ctx = make(finalists);
    // Ben, the only finalist here, lands a loop; Ana lands none and tries none
    expect(take(ctx).train).toMatchObject({ code: "no_loops" });
  });
  it("one direction on at least 75% of the jumps with a direction, only with 8 such jumps and at least half his jumps", () => {
    const at = (side: "left" | "right", n: number, from: number): A[] => Array.from({ length: n }, (_, i) => att(from + i, { kind: "backroll", side }));
    const base = (seven: boolean) => make([H(1, [...at("left", seven ? 6 : 6, 1), ...at("right", 2, 7)], [att(1, { kind: "backroll" })])]);
    expect(take(base(false)).train).toMatchObject({ code: "one_side", n: 75, m: 8, side: "left" });
    // 7 jumps with a direction is not enough
    const seven = make([H(1, [...at("left", 6, 1), ...at("right", 1, 7)], [att(1, { kind: "backroll" })])]);
    expect(take(seven).train?.code).not.toBe("one_side");
    // 8 jumps with a direction but fewer than half of all his jumps: 8 of 20
    const few = make([H(1, [...at("left", 7, 1), ...at("right", 1, 8), ...Array.from({ length: 12 }, (_, i) => att(9 + i, { kind: "backroll", side: null }))], [att(1, { kind: "backroll" })])]);
    expect(take(few).train?.code).not.toBe("one_side");
  });
  it("a heat with half or more of the jumps crashed", () => {
    const ctx = make([H(1, [att(1, { kind: "backroll" }), att(2, { kind: "frontroll", status: "crashed" }), att(3, { kind: "jump", status: "crashed" }), att(4, { kind: "megaloop" })], [att(1, { kind: "backroll" })])]);
    expect(take(ctx).train).toMatchObject({ code: "crashed_half", n: 2, m: 4 });
  });
  it("the same trick landed twice in the same direction in one heat", () => {
    const ctx = make([H(1, [att(1, { kind: "backroll", side: "left" }), att(2, { kind: "backroll", side: "left" }), att(3, { kind: "frontroll", side: "right" })], [att(1, { kind: "backroll" }), att(2, { kind: "frontroll" })])]);
    expect(take(ctx).train).toMatchObject({ code: "repeat_same_side", trick: "Backroll" });
  });
  it("nothing to train: no card", () => {
    const ctx = make([H(1, [att(1, { kind: "backroll", side: "left" }), att(2, { kind: "frontroll", side: "right" })], [att(1, { kind: "backroll" }), att(2, { kind: "frontroll" })], { aWins: true })]);
    expect(take(ctx).train).toBeNull();
  });
  it("trainOf can be used on its own for the judges' compare page", () => {
    const { me } = aggs(make([H(1, [att(1, { kind: "kiteloop", status: "crashed" }), att(2, { kind: "kiteloop", status: "crashed" })], [att(1, { kind: "backroll" })])]));
    expect(trainOf(me, null)?.code).toBe("never_landed");
  });
});

describe("report: the heat strategy point (item 4d)", () => {
  it("in a heat not won: attempts left unused (the heat he lost first)", () => {
    const ctx = make([H(1, [att(1, { kind: "backroll", at: 100 }), att(2, { kind: "frontroll", at: 200 })], [...lands(7)])], { attemptCap: 7 });
    expect(take(ctx).strategy).toMatchObject({ code: "unused_attempts", n: 5, m: 7, heatLabel: "Round 1 · Heat 1" });
  });
  it("first landed trick after half the heat", () => {
    const ctx = make([H(1, [att(1, { kind: "backroll", status: "crashed", at: 100 }), att(2, { kind: "frontroll", at: 400 })], [att(1, { kind: "backroll", at: 100 })])], { attemptCap: 2 });
    expect(take(ctx).strategy).toMatchObject({ code: "late_first_trick", n: 400, m: 600 });
  });
  it("the winner landed more loops", () => {
    const ctx = make([H(1, [att(1, { kind: "backroll", at: 100 }), att(2, { kind: "frontroll", at: 200 })], [att(1, { kind: "kiteloop", at: 100 }), att(2, { kind: "megaloop", at: 200 })])], { attemptCap: 2 });
    expect(take(ctx).strategy).toMatchObject({ code: "winner_more_loops", n: 2, m: 0 });
  });
  it("the winner landed more tricks", () => {
    const ctx = make([H(1, [att(1, { kind: "backroll", at: 100 })], [att(1, { kind: "backroll", at: 100 }), att(2, { kind: "frontroll", at: 200 })])], { attemptCap: 1 });
    expect(take(ctx).strategy).toMatchObject({ code: "winner_more_tricks", n: 2, m: 1 });
  });
  it("as many tricks as the winner: the difference was in the tricks themselves", () => {
    const ctx = make([H(1, [att(1, { kind: "backroll", at: 100 }), att(2, { kind: "frontroll", at: 200 })], [att(1, { kind: "backroll", at: 100 }), att(2, { kind: "frontroll", at: 200 })])], { attemptCap: 2 });
    expect(take(ctx).strategy).toMatchObject({ code: "same_tricks_as_winner", n: 2 });
  });
  it("in a heat won: an early banker (a counted trick in the first third)", () => {
    const ctx = make([H(1, [att(1, { kind: "backroll", counted: true, at: 100 }), att(2, { kind: "frontroll", at: 200 })], [att(1, { kind: "backroll", at: 100 })], { aWins: true })], { attemptCap: 2 });
    expect(take(ctx).strategy).toMatchObject({ code: "early_banker", n: 100, m: 600 });
  });
  it("in a heat won: the best trick in the second half", () => {
    const ctx = make([H(1, [att(1, { kind: "backroll", counted: true, score: 4, at: 250 }), att(2, { kind: "frontroll", counted: true, score: 7, at: 500 })], [att(1, { kind: "backroll", at: 100 })], { aWins: true })], { attemptCap: 2 });
    expect(take(ctx).strategy).toMatchObject({ code: "best_late", n: 500, m: 600 });
  });
  it("a heat he lost is looked at before a heat he won, the latest first", () => {
    const ctx = make([
      H(1, [att(1, { kind: "backroll", counted: true, at: 100 })], [att(1, { kind: "backroll", at: 100 })], { aWins: true }),
      H(2, [att(1, { kind: "backroll", at: 100 })], [att(1, { kind: "backroll", at: 100 }), att(2, { kind: "frontroll", at: 200 })]),
    ], { attemptCap: 2 });
    expect(take(ctx).strategy).toMatchObject({ code: "unused_attempts", heatLabel: "Round 1 · Heat 2" });
  });
});

describe("report: the gap line for the heat that knocked him out (item 4d)", () => {
  const out = (aTricks: number[], bTricks: number[], extraLanded?: number, cap: number | null = 3, aImp = 5, bImp = 5) => {
    const toAtt = (xs: number[]): A[] => xs.map((s, i) => att(i + 1, { kind: i % 2 ? "frontroll" : "backroll", score: s, counted: true, at: (i + 1) * 50 }));
    const heats = [H(1, toAtt(aTricks), toAtt(bTricks), { aTotal: aTricks.reduce((s, x) => s + x, 0) + aImp, bTotal: bTricks.reduce((s, x) => s + x, 0) + bImp })];
    // somebody else landed a big trick at the event
    const c = ctxOf([round("R1", "Round 1", 1, [...heats, ...(extraLanded ? [heat(2, [res("c", 1, [att(1, { kind: "megaloop", score: extraLanded, counted: true })]), res("d", 2, [att(1, { score: 0.5 })])])] : [])], R1_ADVANCE), round("R2", "Final", 2, [], null)], { rules: { attemptCap: cap, countedN: 3 } });
    return c;
  };
  it("misses the Final by 0.4: one more trick above 2.0 in place of the third best (1.6)", () => {
    // Ana: 3.0 + 2.5 + 1.6 + 5 = 12.1; Ben: 3.2 + 2.9 + 1.6 + 5 = 12.7 ... use a 0.4 gap: Ben 12.5
    const ctx = out([3.0, 2.5, 1.6], [3.2, 2.9, 1.5], 4);
    const g = take(ctx).gap!;
    expect(g.miss).toBeCloseTo(0.5, 6);
    expect(g).toMatchObject({ replaces: 1.6, toRound: "Final", heatLabel: "Round 1 · Heat 1" });
    expect(g.needAbove).toBeCloseTo(2.1, 6);
  });
  it("only when a trick scoring that much was landed at the event", () => {
    // the same tricks, a lower Impression score: he missed by 1.0, so a trick above 1.8 would be needed and the best landed is 1.0
    expect(take(out([1.0, 0.9, 0.8], [1.0, 0.9, 0.8], undefined, 3, 4, 5)).gap).toBeNull();
    expect(take(out([1.0, 0.9, 0.8], [1.0, 0.9, 0.8], 1.8, 3, 4, 5)).gap).toBeNull();
    const g = take(out([1.0, 0.9, 0.8], [1.0, 0.9, 0.8], 2.5, 3, 4, 5)).gap!;
    expect(g.needAbove).toBeCloseTo(1.8, 6);
  });
  it("with a free counting place the extra trick need only beat the gap", () => {
    const g = take(out([3.0, 2.5], [3.2, 2.9, 1.5], 4)).gap!;
    expect(g.replaces).toBeNull();
    expect(g.needAbove).toBeCloseTo(g.miss, 6);
  });
  it("no gap line for a rider who went through, and none when the total is not a plain sum of the counted tricks", () => {
    expect(take(out([3.0, 2.5, 1.6], [3.2, 2.9, 1.5], 4), "b").gap).toBeNull();
    const w = out([3.0, 2.5, 1.6], [3.2, 2.9, 1.5], 4);
    w.divisionRules.div.weighted = true;
    expect(take(w).gap).toBeNull();
  });
});
void RULES;
