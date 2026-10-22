import { describe, expect, it } from "vitest";
import { buildRiderReport, isSoFar } from "./build";
import { pickerOf } from "./picker";
import { att, BLOCKS, ctxOf, ENTRIES, FINAL_ADVANCE, heat, P, R1_ADVANCE, res, round } from "./fixture";
import { scenario } from "./scenario";
import { buildTrickIndex, trickKey } from "./tricks";
import type { RiderReport } from "./types";

const rep = (id: string, ctx = scenario()): RiderReport => {
  const r = buildRiderReport(ctx, id);
  if (r.status !== "ok") throw new Error("no report");
  return r;
};

describe("report: the thirteen tiles", () => {
  const t = rep("a").tiles;
  it("jumps, landed, crashes with the field's figure", () => {
    expect(t.jumps).toEqual({ value: 9, heats: 2, allowed: 14 });
    expect(t.landed.value).toBe(7);
    expect(t.landed.rate).toBeCloseTo(7 / 9);
    expect(t.landed.fieldRate).toBeCloseTo(16 / 23);
    expect(t.crashes.value).toBe(2);
  });
  it("different tricks, loops and sides", () => {
    expect(t.different.value).toBe(3);
    expect(t.loops).toEqual({ landed: 4, tried: 5 });
    expect(t.sides).toMatchObject({ left: 6, right: 3, withDirection: 9 });
  });
  it("best trick with the event's best, average trick and impression with the field's", () => {
    expect(t.bestTrick).toEqual({ value: 6.5, eventBest: 7 });
    expect(t.averageTrick.value).toBeCloseTo(5.2429, 3);
    expect(t.averageTrick.field).toBeGreaterThan(0);
    expect(t.impression.value).toBeCloseTo(5.75);
    expect(t.impression.field).toBeCloseTo(3.79, 2);
  });
  it("heats won, average and best total, steadiness", () => {
    expect(t.heatsWon).toMatchObject({ won: 1, heats: 2, share: 0.5 });
    expect(t.averageTotal.value).toBeCloseTo(22.1);
    expect(t.bestTotal).toMatchObject({ value: 22.5, round: "Final", eventBest: 24.5 });
    expect(t.steadiness.value).toBeCloseTo(0.4);
  });
  it("steadiness needs two heats with a total", () => {
    expect(rep("b").tiles.steadiness.value).toBeNull();
  });
});

describe("report: highlights, the rider's own best against the event", () => {
  it("the winner: highest trick of the event, best heat total, winning run", () => {
    expect(rep("d").highlights.map((h) => h.kind)).toEqual(["highest_trick", "best_heat_total", "longest_winning_run"]);
  });
  it("a rider with none says none", () => {
    expect(rep("b").highlights).toEqual([]);
  });
  it("at most three", () => {
    expect(rep("a").highlights.length).toBeLessThanOrEqual(3);
  });
});

describe("report: best tricks, trick mix and the comparison", () => {
  it("the three best jumps, as the reference lists them: a trick that scored twice is listed twice", () => {
    expect(rep("a").bestTricks.map((b) => [b.trick, b.score, b.roundName])).toEqual([["Kiteloop", 6.5, "Final"], ["Kiteloop", 6, "Round 1"], ["×2 Backroll Board-off", 5.5, "Final"]]);
  });
  it("equal scores are listed in the order they were landed", () => {
    const a = [att(1, { kind: "backroll", score: 5, at: 100, counted: true }), att(2, { kind: "frontroll", score: 5, at: 50, counted: true }), att(3, { kind: "jump", score: 5, at: 200, counted: true }), att(4, { kind: "jump", score: 5, at: 300 })];
    const ctx = ctxOf([round("R1", "Round 1", 1, [heat(1, [res("a", 1, a), res("b", 2, [att(1, { kind: "megaloop", score: 1, counted: true })])])], R1_ADVANCE)]);
    expect(rep("a", ctx).bestTricks.map((x) => x.trick)).toEqual(["Frontroll", "Backroll", "Straight jump"]);
  });
});

describe("report: the only rider to land a trick", () => {
  const two = (mine: ReturnType<typeof att>[], theirs: ReturnType<typeof att>[]) => rep("a", ctxOf([round("R1", "Round 1", 1, [heat(1, [res("a", 1, mine), res("b", 2, theirs)])], R1_ADVANCE)])).highlights.find((h) => h.kind === "only_rider_to_land");
  it("a trick nobody else landed, among his three best", () => {
    expect(two([att(1, { kind: "megaloop", score: 6, at: 50 }), att(2, { kind: "backroll", score: 4, at: 90 })], [att(1, { kind: "backroll", score: 3 })])).toMatchObject({ trick: "Megaloop", value: 6 });
  });
  it("a jump that scored as much as his third best counts as one of the three, so a tie is not cut", () => {
    const mine = [att(1, { kind: "backroll", score: 6, at: 40 }), att(2, { kind: "frontroll", score: 5, at: 80 }), att(3, { kind: "backroll", score: 4, at: 120 }), att(4, { kind: "megaloop", score: 4, at: 160 })];
    const theirs = [att(1, { kind: "backroll", score: 2 }), att(2, { kind: "frontroll", score: 2, at: 90 })];
    expect(two(mine, theirs)).toMatchObject({ trick: "Megaloop", value: 4 });
  });
  it("not when the trick only scored less than his third best, and not when the best three are all shared or unnamed", () => {
    const mine = [att(1, { kind: "backroll", score: 6, at: 40 }), att(2, { kind: "backroll", score: 5.5, at: 80 }), att(3, { kind: "frontroll", score: 5, at: 120 }), att(4, { kind: "megaloop", score: 3, at: 160 })];
    expect(two(mine, [att(1, { kind: "backroll", score: 2 }), att(2, { kind: "frontroll", score: 2, at: 90 })])).toBeUndefined();
    const unnamed = [att(1, { kind: null, score: 6, at: 40 }), att(2, { kind: null, score: 5, at: 80 }), att(3, { kind: null, score: 4, at: 120 }), att(4, { kind: "megaloop", score: 3, at: 160 })];
    expect(two(unnamed, [att(1, { kind: "backroll", score: 2 })])).toBeUndefined();
  });
});

describe("report: best tricks, trick mix and the comparison (continued)", () => {
  it("the trick mix lists the families, what landed and what is still to land", () => {
    const m = rep("a").mix;
    expect(m.families.map((f) => [f.key, f.tried, f.landed])).toEqual([["kiteloop", 5, 4], ["board_off", 3, 3], ["rotation", 1, 0]]);
    expect(m.stillToLand).toEqual(["Frontroll"]);
    expect(m.landedTricks[0]).toMatchObject({ count: 3 });
  });
  it("six comparison rows, finalists included when the division has a final", () => {
    const c = rep("a").compare;
    expect(c.map((x) => x.key)).toEqual(["landing_rate", "attempts_used", "loop_share", "tricks_per_heat", "average_trick", "impression"]);
    expect(c.every((x) => x.finalists !== null)).toBe(true);
    expect(c[0].scale).toBe(1);
  });
});

describe("report: the heat, as the reference draws it", () => {
  const h = rep("a").heats;
  it("the result, the cap, the pace, the field's average", () => {
    expect(h[0]).toMatchObject({ heatNo: "Heat 1", outcome: "won", place: 1, toRound: "Final", jumps: 5, cap: 7, crashes: 1, firstLandedAt: 60, lengthSec: 600, fieldAverage: 4.2 });
  });
  it("how far behind the winner, in points", () => {
    expect(h[1].behind).toEqual({ gap: 2, to: "winner" });
  });
});

describe("report: who rode and who did not", () => {
  const ride = (impression: number | null = 5) => [att(1, { score: 5, counted: true })].map((a) => res("a", 1, [a], { impression }));
  it("a rider with no jump and a winning total is a walkover, with a total of 0 a rider who did not start", () => {
    const walk = res("b", 1, [], { total: 12 });
    const dns = res("c", 3, [], { total: 0 });
    const ctx = ctxOf([round("R1", "Round 1", 1, [heat(1, [...ride(), walk, dns])], R1_ADVANCE)]);
    expect(rep("b", ctx).headline.steps[0].outcome).toBe("walkover");
    const c = buildRiderReport(ctx, "c");
    if (c.status === "ok") expect(c.headline.steps.every((x) => x.outcome === "did_not_start")).toBe(true);
    else expect(c.status).not.toBe("ok");
  });
});

describe("report: the picker", () => {
  it("everyone with a ridden published heat, finalists by place first, then by how far they got", () => {
    const p = pickerOf(scenario());
    expect(p.map((x) => [x.name, x.place, x.lastRound])).toEqual([
      ["Di Sample", 1, "Final"],
      ["Ana Sample", 2, "Final"],
      ["Ben Sample", null, "Round 1"],
      ["Cy Sample", null, "Round 1"],
      ["Eli Sample", null, "Round 1"],
      ["Flo Sample", null, "Round 1"],
    ]);
  });
  it("leaves out a rider under 18 and a rider with no heat", () => {
    const ctx = scenario();
    ctx.data.entries = ctx.data.entries.map((e) => (e.id === "b" ? { ...e, report_withheld: true } : e));
    expect(pickerOf(ctx).map((x) => x.entryId)).not.toContain("b");
    const none = ctxOf([round("R1", "Round 1", 1, [], R1_ADVANCE), round("R2", "Final", 2, [], FINAL_ADVANCE)], { entries: ENTRIES });
    expect(pickerOf(none)).toEqual([]);
  });
});

describe("report: the same trick is one trick, however it was tapped", () => {
  const idx = buildTrickIndex(BLOCKS);
  it("the order of the blocks does not matter", () => {
    expect(trickKey(idx, { parts: P.backroll2BoardOff, trick: "x" })).toBe(trickKey(idx, { parts: P.boardOffBackroll2, trick: "y" }));
  });
  it("the event's own copy of a block and the master one are one trick", () => {
    expect(trickKey(idx, { parts: P.kiteloop, trick: "" })).toBe(trickKey(idx, { parts: P.localKiteloop, trick: "" }));
  });
  it("a different multiplier is a different trick", () => {
    expect(trickKey(idx, { parts: P.backroll, trick: "" })).not.toBe(trickKey(idx, { parts: P.backroll2BoardOff, trick: "" }));
  });
});

describe("report: names come from the event, never written out", () => {
  it("Impression and In / Out here; Variety and Left / Right in another event", () => {
    expect(rep("a")).toMatchObject({ scoreName: "Impression", sideWords: { left: "In", right: "Out" } });
    const c = scenario();
    c.impressionName = "Variety";
    c.sideWords = { left: "Left", right: "Right" };
    expect(rep("a", c)).toMatchObject({ scoreName: "Variety", sideWords: { left: "Left", right: "Right" } });
  });
  it("the report holds no judge, hint, pending row or contact", () => {
    const text = JSON.stringify(rep("a")).toLowerCase();
    for (const w of ["judge", "pending", "email", "phone", "dob", "outlier"]) expect(text).not.toContain(w);
  });
});

describe('report: "so far" shows only while the division can still change', () => {
  const withOpen = (open: number | undefined, status = "live") => {
    const c = scenario();
    c.data.event.status = status;
    c.data.divisions[0].open_heats = open;
    return rep("a", c).soFar;
  };
  it("a heat of the division is not published yet: so far", () => {
    expect(withOpen(1)).toBe(true);
    expect(withOpen(4, "published")).toBe(true);
  });
  it("every heat of the division is published: no so far, although the event is not marked complete", () => {
    expect(withOpen(0)).toBe(false);
    expect(withOpen(0, "published")).toBe(false);
  });
  it("the event is marked complete: no so far, whatever is left open", () => {
    expect(withOpen(3, "complete")).toBe(false);
    expect(withOpen(0, "complete")).toBe(false);
  });
  it("an answer that does not say how many heats are open keeps the old rule (so far until complete)", () => {
    expect(withOpen(undefined)).toBe(true);
    expect(withOpen(undefined, "complete")).toBe(false);
  });
  it("the rule on its own", () => {
    expect([isSoFar("live", 2), isSoFar("live", 0), isSoFar("complete", 2), isSoFar("complete", 0)]).toEqual([true, false, false, false]);
  });
});

describe("report: suggested goals for a rider with nothing to train", () => {
  it("the winner of the example event has no thing to train, and gets two goals about what he already does", () => {
    const r = rep("d");
    expect(r.takeaways.train).toBeNull();
    expect(r.suggested.map((g) => g.code)).toEqual(["keep_top_trick", "keep_early_banker_all"]);
    expect(r.suggested[0]).toMatchObject({ trick: "Kiteloop", nums: [7, 1] });
    expect(r.suggested[1].nums).toEqual([2]);
  });
  it("a rider who has something to train keeps getting those goals, not the keep-doing ones", () => {
    expect(rep("a").suggested.every((g) => !g.code.startsWith("keep_"))).toBe(true);
  });
  it("no strength and no won heat: no goal is made up", () => {
    const high = Array.from({ length: 6 }, (_, i) => att(i + 1, { score: 9, at: (i + 1) * 40, kind: "backroll" }));
    const c = ctxOf([round("R1", "Round 1", 1, [heat(1, [res("b", 1, high), res("a", 2, [att(1, { kind: "backroll", score: 8.5, counted: true })])])], R1_ADVANCE)]);
    const r = rep("a", c);
    expect(r.takeaways.train).toBeNull();
    expect(r.suggested).toEqual([]);
  });
  it("only a heat he won counts for the habit: in one won heat with an early counting trick it names that heat; with none early, the best trick kept for the end", () => {
    const early = [att(1, { kind: "backroll", score: 6, at: 100, counted: true }), att(2, { kind: "frontroll", score: 6, at: 300, counted: true })];
    const one = rep("a", ctxOf([round("R1", "Round 1", 1, [heat(1, [res("a", 1, early), res("b", 2, [att(1, { kind: "backroll", score: 3, counted: true })])])], R1_ADVANCE)]));
    expect(one.suggested.map((g) => g.code)).toContain("keep_early_banker");
    const late = [att(1, { kind: "backroll", score: 5, at: 350, counted: true }), att(2, { kind: "frontroll", score: 6, at: 500, counted: true })];
    const two = rep("a", ctxOf([round("R1", "Round 1", 1, [heat(1, [res("a", 1, late), res("b", 2, [att(1, { kind: "backroll", score: 3, counted: true })])])], R1_ADVANCE)]));
    expect(two.suggested.map((g) => g.code)).toContain("keep_best_late");
  });
});
