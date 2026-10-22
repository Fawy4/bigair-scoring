import { describe, expect, it } from "vitest";
import { buildRiderReport } from "./build";
import { scenario } from "./scenario";
import { att, ctxOf, heat, R1_ADVANCE, res, round } from "./fixture";
import type { DivisionRules, ReportAttempt, ReportContext, ReportResult, RiderReport } from "./types";

type A = ReportAttempt;
type O = NonNullable<Parameters<typeof att>[1]>;
const lands = (n: number, o: O = {}, from = 1): A[] => Array.from({ length: n }, (_, i) => att(from + i, { score: 5, at: (from + i) * 50, ...o }));
const crashes = (from: number, n: number, o: O = {}): A[] => Array.from({ length: n }, (_, i) => att(from + i, { status: "crashed", at: (from + i) * 50, ...o }));
const KINDS = ["kiteloop", "megaloop", "backroll", "frontroll", "jump"] as const;
const mixed = (n: number, score: number, from = 1): A[] => Array.from({ length: n }, (_, i) => att(from + i, { score, at: (from + i) * 50, kind: KINDS[i % KINDS.length], side: i % 2 ? "right" : "left" }));
/** Different tricks, alternating sides, so that no "same trick, same side twice" line gets in the way. */
const varied = (n: number, o: O = {}, from = 1): A[] => Array.from({ length: n }, (_, i) => att(from + i, { score: 5, at: (from + i) * 50, kind: KINDS[(from + i) % KINDS.length], side: i % 2 ? "right" : "left", ...o }));
/** One heat per entry of `rows`: rider a against rider b; the better total wins. */
const H = (n: number, a: A[], b: A[], o: { aImp?: number; bImp?: number } = {}) => {
  const ra: ReportResult = res("a", 1, a, { impression: o.aImp ?? 5 });
  const rb: ReportResult = res("b", 2, b, { impression: o.bImp ?? 5 });
  const [first, second] = (ra.total ?? 0) >= (rb.total ?? 0) ? [ra, rb] : [rb, ra];
  first.place = 1;
  second.place = 2;
  return heat(n, [first, second], { id: `heat-${n}` });
};
const make = (heats: ReturnType<typeof H>[], rules: Partial<DivisionRules> = {}): ReportContext => ctxOf([round("R1", "Round 1", 1, heats, R1_ADVANCE)], { rules });
const rep = (ctx: ReportContext, id = "a"): RiderReport => {
  const r = buildRiderReport(ctx, id);
  if (r.status !== "ok") throw new Error("no report");
  return r;
};

describe("report: strengths, the first that applies", () => {
  it("a best trick among the event's five highest scores comes first", () => {
    const ctx = make([H(1, [att(1, { score: 6.5, at: 60 }), ...lands(2, {}, 2)], lands(3))]);
    expect(rep(ctx).takeaways.strength).toMatchObject({ code: "top_trick", nums: [6.5, 1], trick: "Backroll", round: "Round 1" });
  });
  it("not when six scores in the event are higher", () => {
    const high = Array.from({ length: 6 }, (_, i) => att(i + 1, { score: 9, at: (i + 1) * 40 }));
    const ctx = make([H(1, lands(3, { score: 4 }), high)]);
    expect(rep(ctx).takeaways.strength?.code).not.toBe("top_trick");
  });
  it("two loops landed, when no top score applies", () => {
    const high = Array.from({ length: 6 }, (_, i) => att(i + 1, { score: 9, at: (i + 1) * 40 }));
    const a = [att(1, { kind: "kiteloop", score: 4 }), att(2, { kind: "megaloop", score: 4 }), att(3, { kind: "backroll", status: "crashed" })];
    expect(rep(make([H(1, a, high)])).takeaways.strength).toMatchObject({ code: "loops", nums: [2, 2] });
  });
  it("growth through the day: landing rate up by 25 points or more from the first heat to the last", () => {
    const high = Array.from({ length: 6 }, (_, i) => att(i + 1, { score: 9, at: (i + 1) * 40 }));
    const first = [...lands(3, { score: 4 }), ...crashes(4, 4)];
    const last = [...lands(6, { score: 4 }), ...crashes(7, 1)];
    const ctx = make([H(1, first, high), H(2, last, high)]);
    expect(rep(ctx).takeaways.strength).toMatchObject({ code: "growth", nums: [43, 86], round: "Round 1" });
  });
  it("not when the rise is under 25 points", () => {
    const high = Array.from({ length: 6 }, (_, i) => att(i + 1, { score: 9, at: (i + 1) * 40 }));
    const ctx = make([H(1, [...lands(4, { score: 4 }), ...crashes(5, 3)], high), H(2, [...lands(5, { score: 4 }), ...crashes(6, 2)], high)]);
    expect(rep(ctx).takeaways.strength?.code).not.toBe("growth");
  });
  it("landing rate at least 8 points above the field", () => {
    const high = Array.from({ length: 6 }, (_, i) => att(i + 1, { score: 9, at: (i + 1) * 40 }));
    const ctx = make([H(1, lands(6, { score: 4 }), [...high, ...crashes(7, 4)])]);
    expect(rep(ctx).takeaways.strength?.code).toBe("landing_rate");
  });
  it("impression above the field by a quarter", () => {
    const high = Array.from({ length: 6 }, (_, i) => att(i + 1, { score: 9, at: (i + 1) * 40 }));
    const a = [...lands(2, { score: 4 }), ...crashes(3, 1), ...crashes(4, 1), ...crashes(5, 1)];
    const ctx = make([H(1, a, [...high, ...crashes(7, 1)], { aImp: 8, bImp: 4 })]);
    // the landing rate is below the field here, so the impression is the first that applies
    expect(rep(ctx).takeaways.strength).toMatchObject({ code: "impression_above", nums: [8, 6] });
  });
  it("nothing applies: no strength is made up", () => {
    const high = Array.from({ length: 6 }, (_, i) => att(i + 1, { score: 9, at: (i + 1) * 40 }));
    expect(rep(make([H(1, [att(1, { status: "crashed" }), att(2, { status: "crashed" })], high)])).takeaways.strength).toBeNull();
  });
});

describe("report: what to train, the first that applies", () => {
  /** Round 1 with rider a, out; rider b wins and rides the Final alone with rider c: the finalists are b and c. */
  const out = (a: A[], b: A[], fin: A[], o: { aImp?: number; bImp?: number } = {}): ReportContext => {
    const r1 = H(1, a, b, o);
    const r1Winner = r1.results.find((r) => r.place === 1)?.entry_id;
    const ra = res("b", 1, fin, { impression: o.bImp ?? 5 });
    const rc = res("c", 2, fin, { impression: o.bImp ?? 5 });
    const f = heat(2, [ra, rc], { id: "heat-2" });
    void r1Winner;
    return ctxOf([round("R1", "Round 1", 1, [r1], R1_ADVANCE), round("R2", "Final", 2, [f], [{ to: "final_placing", places: "rest" }])]);
  };
  const loopy = (n: number, score = 6) => varied(n, { kind: "kiteloop", score, side: "left" }).map((x, i) => ({ ...x, kind: undefined, direction: i % 2 ? "right" : "left" })) as A[];
  void loopy;
  it("no loops while the finalists did loops", () => {
    const ctx = out(varied(3, { score: 3, kind: "backroll" }).map((x, i) => ({ ...x, trick: `t${i}`, parts: null })), lands(3, { kind: "kiteloop", score: 6 }), lands(3, { kind: "kiteloop", score: 6 }));
    expect(rep(ctx).takeaways.train).toMatchObject({ code: "no_loops", nums: [100] });
  });
  it("landed tricks averaging well below the finalists'", () => {
    const a = varied(3, { score: 2, kind: "frontroll" }).map((x, i) => ({ ...x, parts: null, trick: `trick ${i}` }));
    const ctx = out([...a, ...crashes(4, 0)], lands(3, { kind: "kiteloop", score: 6 }), lands(3, { kind: "kiteloop", score: 6 }));
    const t = rep(ctx).takeaways.train;
    expect(["no_loops", "landed_average_low"]).toContain(t?.code);
    const all = rep(ctx).suggested.map((x) => x.code);
    expect(all).toContain("landed_average_low");
  });
  it("half of a heat's jumps crashed", () => {
    const a = [...varied(2, { kind: "kiteloop", score: 6 }), ...crashes(3, 3, { kind: "kiteloop" })];
    expect(rep(make([H(1, a, lands(5, { score: 7 }))])).takeaways.train).toMatchObject({ code: "crashed_half", nums: [3, 5], round: "Round 1" });
  });
  it("impression below the field by a quarter", () => {
    const ctx = make([H(1, mixed(3, 6), mixed(3, 6), { aImp: 2, bImp: 6 })]);
    const t = rep(ctx, "a").takeaways.train;
    expect(t).toMatchObject({ code: "impression_below" });
    expect(t?.nums).toEqual([2, 4]);
  });
  it("a rider with nothing to train gets none, and no goal is made up", () => {
    const ctx = make([H(1, mixed(3, 7), mixed(3, 3))]);
    const r = rep(ctx);
    expect(r.takeaways.train).toBeNull();
    expect(r.suggested).toEqual([]);
  });
  it("the suggested goals are the first two things to train", () => {
    const a = [...varied(2, { kind: "kiteloop", score: 6 }), ...crashes(3, 3, { kind: "kiteloop" })];
    const r = rep(make([H(1, a, lands(5, { score: 7 }))]));
    expect(r.suggested.length).toBeLessThanOrEqual(2);
    expect(r.suggested[0]).toEqual(r.takeaways.train);
  });
});

describe("report: strategy", () => {
  it("a lost heat that missed the next round names the gap, in points or in places", () => {
    const a = mixed(7, 5).map((x, i) => ({ ...x, counted: i < 3 }));
    const b = [...mixed(6, 6).map((x, i) => ({ ...x, counted: i < 3 })), att(7, { kind: "megaloop", score: 9, at: 400 })];
    const ctx = make([H(1, a, b)]);
    expect(rep(ctx).takeaways.strategy?.code).toMatch(/^gap_/);
  });
  it("a lost heat with attempts left unused says so", () => {
    const ctx = make([H(1, mixed(3, 5).map((x) => ({ ...x, counted: true })), mixed(3, 6).map((x) => ({ ...x, counted: true })))]);
    expect(rep(ctx).takeaways.strategy).toMatchObject({ code: "unused_attempts", nums: [3, 7] });
  });
  it("a won heat banked early is the early banker", () => {
    const early = mixed(3, 6).map((x, i) => ({ ...x, counted: true, at_sec: 30 + i * 100 }));
    const r = rep(make([H(1, early, mixed(3, 3).map((x) => ({ ...x, counted: true })))]));
    expect(r.takeaways.strategy?.code).toMatch(/early_banker|best_late/);
  });
});

// the rules that have no loop in them: three plain tricks, so nothing here is a loop
const PLAIN = ["backroll", "frontroll", "jump"] as const;
const plain = (n: number, score: number, o: O = {}, from = 1): A[] => Array.from({ length: n }, (_, i) => att(from + i, { score, at: (from + i) * 50, kind: PLAIN[i % PLAIN.length], ...o }));
/** Six landings of one trick at 9: the event's six highest scores, so nobody else is in the top five, and one different trick a heat. */
const sixNines = (): A[] => Array.from({ length: 6 }, (_, i) => att(i + 1, { score: 9, at: (i + 1) * 40, kind: "backroll" }));
const counted = (xs: A[], n: number): A[] => xs.map((x, i) => ({ ...x, counted: i < n && x.status === "landed" }));

describe("report: the other strengths, each on its own", () => {
  it("every attempt used in every heat", () => {
    const ctx = make([H(1, [...counted(plain(4, 4), 3), ...crashes(5, 3)], counted(sixNines(), 3))]);
    expect(rep(ctx).takeaways.strength).toMatchObject({ code: "every_attempt", nums: [7, 7] });
  });
  it("more different tricks a heat than the field", () => {
    const ctx = make([H(1, counted(plain(3, 4), 3), counted(sixNines(), 3))]);
    expect(rep(ctx).takeaways.strength).toMatchObject({ code: "variety_per_heat", nums: [3, 2] });
  });
  it("a trick landed on both sides", () => {
    const a = [att(1, { kind: "backroll", score: 4, side: "left", counted: true }), att(2, { kind: "backroll", score: 4, side: "right", at: 100, counted: true })];
    expect(rep(make([H(1, a, counted(sixNines(), 3))])).takeaways.strength).toMatchObject({ code: "both_sides", nums: [1], trick: "Backroll" });
  });
  it("the totals rising from the first heat to the last", () => {
    const one = (score: number) => [att(1, { kind: "backroll", score, counted: true })];
    const ctx = make([H(1, one(4), counted(sixNines(), 3)), H(2, one(5), counted(sixNines(), 3))]);
    expect(rep(ctx).takeaways.strength).toMatchObject({ code: "totals_growth", nums: [9, 10] });
  });
});

describe("report: the other things to train, each on its own", () => {
  it("one side on three quarters of the jumps with a side (from eight jumps)", () => {
    const ctx = make([H(1, counted(plain(8, 4, { side: "left" }), 3), counted(sixNines(), 3))]);
    expect(rep(ctx).takeaways.train).toMatchObject({ code: "one_side", nums: [8, 8], side: "left" });
  });
  it("loops landed less than half the time", () => {
    const a = [att(1, { kind: "kiteloop", score: 5 }), att(2, { kind: "kiteloop", status: "crashed", at: 100 }), att(3, { kind: "kiteloop", status: "crashed", at: 150 }), ...plain(3, 5, { side: "right" }, 4).map((x, i) => ({ ...x, direction: i % 2 ? "left" : "right" }) as A)];
    expect(rep(make([H(1, counted(a, 3), counted(plain(6, 5, { side: "right" }), 3))])).takeaways.train).toMatchObject({ code: "loops_half", nums: [1, 3] });
  });
  it("a trick tried at least twice and never landed", () => {
    const a = [...counted([att(1, { kind: "backroll", score: 5, at: 50 }), att(2, { kind: "jump", score: 5, at: 100, side: "right" }), att(3, { kind: "jump", score: 5, at: 150, side: "left" })], 3), att(5, { kind: "frontroll", status: "crashed", at: 300 }), att(6, { kind: "frontroll", status: "crashed", at: 350, side: "right" })];
    expect(rep(make([H(1, a, counted(plain(6, 5), 3))])).takeaways.train).toMatchObject({ code: "never_landed", nums: [2], trick: "Frontroll" });
  });
  it("the same trick landed twice on the same side in one heat", () => {
    const a = [att(1, { kind: "backroll", score: 5, counted: true }), att(2, { kind: "backroll", score: 5, at: 100, counted: true })];
    expect(rep(make([H(1, a, counted(plain(6, 5), 3))])).takeaways.train).toMatchObject({ code: "repeat_same_side", nums: [2], trick: "Backroll", side: "left", round: "Round 1" });
  });
});

describe("report: the heat strategy, each point on its own", () => {
  // weighted: the gap line is not drawn, so the other points can be seen
  const lost = (a: A[], b: A[]) => rep(make([H(1, a, b)], { weighted: true })).takeaways.strategy;
  const winnerOf = (n: number, o: O = {}): A[] => [...counted(plain(n, 6, o), 3), ...crashes(n + 1, 7 - n)];
  it("the winner landed fewer tricks than you", () => {
    expect(lost([...plain(5, 3, { at: 40 }), ...crashes(6, 2)].map((x, i) => ({ ...x, at_sec: 40 + i * 40 })), winnerOf(4))).toMatchObject({ code: "winner_fewer", nums: [5, 4] });
  });
  it("your first trick came after half the heat", () => {
    const a = [...crashes(1, 5), att(6, { score: 3, at: 400 }), att(7, { score: 3, at: 450 })];
    expect(lost(a, winnerOf(3))).toMatchObject({ code: "late_first_trick", nums: [400, 600] });
  });
  it("the winner landed more loops", () => {
    const w = [...counted([att(1, { kind: "kiteloop", score: 6 }), att(2, { kind: "megaloop", score: 6, at: 100 }), att(3, { kind: "backroll", score: 6, at: 150 })], 3), ...crashes(4, 4)];
    expect(lost([...plain(3, 3, { at: 40 }), ...crashes(4, 4)], w)).toMatchObject({ code: "winner_more_loops", nums: [2, 0] });
  });
  it("the winner landed more tricks", () => {
    expect(lost([...plain(3, 3, { at: 40 }), ...crashes(4, 4)], winnerOf(5))).toMatchObject({ code: "winner_more_tricks", nums: [5, 3] });
  });
  it("as many tricks as the winner: the difference was in the tricks themselves", () => {
    expect(lost([...plain(3, 3, { at: 40 }), ...crashes(4, 4)], winnerOf(3))).toMatchObject({ code: "same_tricks_as_winner", nums: [3] });
  });
  it("a won heat: a counting trick banked in the first third, else the best trick in the second half", () => {
    const early = [att(1, { kind: "backroll", score: 6, at: 100, counted: true }), att(2, { kind: "frontroll", score: 6, at: 300, counted: true })];
    expect(rep(make([H(1, early, counted(plain(3, 3), 3))])).takeaways.strategy).toMatchObject({ code: "early_banker", nums: [100], round: "Round 1" });
    const late = [att(1, { kind: "backroll", score: 5, at: 350, counted: true }), att(2, { kind: "frontroll", score: 6, at: 500, counted: true })];
    expect(rep(make([H(1, late, counted(plain(3, 3), 3))])).takeaways.strategy).toMatchObject({ code: "best_late", nums: [500] });
  });
  it("the gap line, in its three forms: out of the event, straight on to the next round, and to the place above", () => {
    const a = counted(mixed(7, 5), 3);
    const b = [...counted(mixed(6, 6), 3), att(7, { kind: "megaloop", score: 9, at: 400 })];
    expect(rep(make([H(1, a, b)])).takeaways.strategy).toMatchObject({ code: "gap_out" });
    const direct = ctxOf([round("R1", "Round 1", 1, [H(1, a, b)], [{ to: "R2", places: [1] }, { to: "R2b", places: [2] }, { to: "eliminated", places: "rest" }])], {});
    expect(rep(direct).takeaways.strategy).toMatchObject({ code: "gap_direct" });
    expect(rep(scenario()).takeaways.strategy).toMatchObject({ code: "gap_place", nums: [2, 6.5, 4.5, 3], target: "1st", round: "Final" });
  });
});
