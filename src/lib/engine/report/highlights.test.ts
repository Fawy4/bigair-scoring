import { describe, expect, it } from "vitest";
import { buildRiderReport } from "./build";
import { everyone, indexOf } from "./collect";
import { highlightsOf } from "./highlights";
import { att, ctxOf, heat, R1_ADVANCE, res, round } from "./fixture";
import { scenario } from "./scenario";
import type { ReportContext, RiderReport } from "./types";

const rep = (id: string, ctx: ReportContext = scenario()): RiderReport => {
  const r = buildRiderReport(ctx, id);
  if (r.status !== "ok") throw new Error(`no report for ${id}`);
  return r;
};
const kinds = (r: RiderReport) => r.highlights.map((h) => h.kind);
/** Every highlight the rider qualifies for, before the limit of three. */
const every = (ctx: ReportContext, id: string) => {
  const all = [...everyone(ctx, indexOf(ctx)).values()];
  return highlightsOf(all.find((a) => a.entryId === id)!, all, "Impression", 99);
};

describe("report: highlights, only where the rider was first or joint first (item 4c)", () => {
  it("at most three, in the fixed order of the brief", () => {
    // Ana is first in most tricks landed, loops landed, fewest crashes (the only rider with 8 jumps) and best impression, and the only rider to land a double backroll board-off
    expect(kinds(rep("a"))).toEqual(["most_tricks", "most_loops", "fewest_crashes"]);
  });
  it("the highest scoring trick, best heat total and longest winning run belong to the rider who has them", () => {
    const di = rep("d").highlights;
    expect(di.map((h) => h.kind)).toEqual(["highest_trick", "best_heat_total", "longest_winning_run"]);
    expect(di[0]).toMatchObject({ value: 7, trick: "Kiteloop" });
    expect(di[1].value).toBeCloseTo(24.5, 6);
    expect(di[2].value).toBe(2);
  });
  it("no highlight, no highlights card: a rider who is first at nothing has an empty list", () => {
    expect(rep("b").highlights).toEqual([]);
  });
  it("a joint first counts for both riders", () => {
    const c = ctxOf([round("R1", "Round 1", 1, [heat(1, [res("a", 1, [att(1, { counted: true, score: 5 }), att(2, { counted: true, score: 4 })]), res("b", 2, [att(1, { counted: true, score: 5 }), att(2, { counted: true, score: 3 })])])], R1_ADVANCE)]);
    expect(kinds(rep("a", c))).toContain("most_tricks");
    expect(kinds(rep("b", c))).toContain("most_tricks");
  });
  it("zero is never a highlight: nobody lands a loop, nobody is 'most loops'", () => {
    const c = ctxOf([round("R1", "Round 1", 1, [heat(1, [res("a", 1, [att(1, { counted: true })]), res("b", 2, [att(1, { counted: true })])])], R1_ADVANCE)]);
    expect(kinds(rep("a", c))).not.toContain("most_loops");
  });
  it("a winning run needs a win: one heat won is a run of one, shown only when it is the longest", () => {
    expect(rep("a").highlights.map((h) => h.kind)).not.toContain("longest_winning_run");
  });
  it("fewest crashes counts only from 8 jumps", () => {
    const few = (n: number) => Array.from({ length: n }, (_, i) => att(i + 1, { counted: i < 3, score: 5, at: (i + 1) * 40 }));
    const c7 = ctxOf([round("R1", "Round 1", 1, [heat(1, [res("a", 1, few(7)), res("b", 2, [att(1)])])], R1_ADVANCE)]);
    const c8 = ctxOf([round("R1", "Round 1", 1, [heat(1, [res("a", 1, few(8)), res("b", 2, [att(1)])])], R1_ADVANCE)]);
    expect(every(c7, "a").map((h) => h.kind)).not.toContain("fewest_crashes");
    expect(every(c8, "a").map((h) => h.kind)).toContain("fewest_crashes");
  });
  it("the highest score of the impression score carries the event's name for it", () => {
    const c = scenario();
    expect(every(c, "a").find((h) => h.kind === "best_impression")).toMatchObject({ value: 6, scoreName: "Impression" });
  });
  it("'the only rider to land X' only when X is one of his three best scoring tricks", () => {
    // Ana's megaloop is hers alone but it is her third best of three: it counts as soon as it is in the best three
    const c = ctxOf([round("R1", "Round 1", 1, [heat(1, [
      res("a", 1, [att(1, { kind: "megaloop", score: 7, counted: true })]),
      res("b", 2, [att(1, { kind: "backroll", score: 6, counted: true })]),
    ])], R1_ADVANCE)]);
    expect(every(c, "a").find((h) => h.kind === "only_rider_to_land")).toMatchObject({ trick: "Megaloop" });
    // a trick landed only by him but ranking 4th among his tricks is not mentioned
    const four = ctxOf([round("R1", "Round 1", 1, [heat(1, [
      res("a", 1, [att(1, { kind: "backroll", score: 9, counted: true }), att(2, { kind: "kiteloop", score: 8, counted: true }), att(3, { kind: "frontroll", score: 7, counted: true }), att(4, { kind: "megaloop", score: 1 })]),
      res("b", 2, [att(1, { kind: "backroll", score: 6, counted: true }), att(2, { kind: "kiteloop", score: 6 }), att(3, { kind: "frontroll", score: 6 })]),
    ])], R1_ADVANCE)]);
    expect(every(four, "a").find((h) => h.kind === "only_rider_to_land")).toBeUndefined();
  });
});
