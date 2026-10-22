import { describe, expect, it } from "vitest";
import { buildRiderReport } from "./build";
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
  it("three best tricks, each trick once, with the round", () => {
    expect(rep("a").bestTricks.map((b) => [b.trick, b.score, b.roundName])).toEqual([["Kiteloop", 6.5, "Final"], ["×2 Backroll Board-off", 5.5, "Final"], ["Megaloop", 4, "Round 1"]]);
  });
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
