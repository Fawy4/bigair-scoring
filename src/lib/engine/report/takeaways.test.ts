import { describe, expect, it } from "vitest";
import { buildRiderReport } from "./build";
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
