import { describe, expect, it } from "vitest";
import { buildRiderReport } from "./build";
import { att, ctxOf, ENTRIES, FINAL_ADVANCE, heat, R1_ADVANCE, res, round } from "./fixture";
import { heatLength } from "./collect";
import { scenario } from "./scenario";
import type { ReportContext, RiderReport } from "./types";

const rep = (id: string, ctx: ReportContext = scenario()): RiderReport => {
  const r = buildRiderReport(ctx, id);
  if (r.status !== "ok") throw new Error(`no report for ${id}: ${r.status}`);
  return r;
};

describe("report: headline and path through the rounds (item 4a)", () => {
  it("a finalist: his place, and a path of steps ending in the Final", () => {
    const h = rep("a").headline;
    expect(h).toMatchObject({ place: 2, shared: false, outInRound: null, stillIn: false });
    expect(h.steps.map((s) => [s.roundName, s.outcome, s.toRound])).toEqual([["Round 1", "won", "Final"], ["Final", "done", null]]);
  });
  it("a rider knocked out shares his place and names the round: 'Out in Round 1'", () => {
    const h = rep("b").headline;
    expect(h).toMatchObject({ place: 3, shared: true, outInRound: "Round 1" });
    expect(h.steps).toHaveLength(1);
    expect(h.steps[0]).toMatchObject({ outcome: "out", place: 2 });
  });
  it("a rider with no place yet is still in, with the last round he rode", () => {
    const c = scenario();
    c.placings = {};
    const h = rep("a", c).headline;
    expect(h).toMatchObject({ place: null, stillIn: true, lastRound: "Final" });
  });
  it("a walkover shows as a walkover step and a rider who was not there as 'did not start'; a withdrawn one as out of the event", () => {
    const wo = heat(5, [res("a", 1, [], { status: "WO", total: 0, impression: null })]);
    const dns = heat(6, [res("b", 1, [att(1, { counted: true })])], { slots: [{ position: 1, entry_id: "b", modifier: null }, { position: 2, entry_id: "c", modifier: "DNS" }] });
    const c = ctxOf([round("R1", "Round 1", 1, [wo, dns], R1_ADVANCE)]);
    expect(rep("a", c).headline.steps[0].outcome).toBe("walkover");
    expect(rep("c", c).headline.steps[0].outcome).toBe("did_not_start");
    c.data.entries = c.data.entries.map((e) => (e.id === "c" ? { ...e, withdrawn: true } : e));
    expect(rep("c", c).headline.steps[0].outcome).toBe("out_of_event");
  });
  it("a walkover heat adds no jumps and no heat to his figures", () => {
    const wo = heat(5, [res("a", 1, [], { status: "WO", total: 0, impression: null })]);
    const real = heat(6, [res("a", 1, [att(1, { counted: true })]), res("b", 2, [att(1, { counted: true })])]);
    const c = ctxOf([round("R1", "Round 1", 1, [wo, real], R1_ADVANCE)]);
    const r = rep("a", c);
    expect(r.tiles.heatsWon).toEqual({ value: 1, heats: 1 });
    expect(r.tiles.jumps.value).toBe(1);
  });
});

describe("report: heat by heat (item 4f)", () => {
  const r = rep("a");
  const h1 = r.heats[0];
  it("outcome, total as best tricks + the impression score, and the lead over the next rider", () => {
    expect(h1).toMatchObject({ outcome: "won", place: 1, total: 21.7, tricksTotal: 16.2, impression: 5.5, heatLabel: "Round 1 · Heat 1" });
    expect(h1.leadOverNext).toBeCloseTo(12.7, 6);
    expect(h1.gapToWinner).toBeNull();
  });
  it("attempts, crash rate, first landed trick and pace ('a jump every 2:00')", () => {
    expect(h1).toMatchObject({ jumps: 5, crashes: 1, firstLandedAt: 60, paceSec: 120, lengthSec: 600 });
    expect(h1.crashRate).toBeCloseTo(0.2, 6);
  });
  it("the timeline places each jump by its time, scores landed tricks, marks counted ones, and carries the field's average line", () => {
    expect(h1.timeline[0]).toEqual({ x: 0.1, seconds: 60, score: 5, landed: true, counted: true });
    expect(h1.timeline[1]).toMatchObject({ landed: false, score: null, counted: false });
    expect(h1.fieldAverage).toBeCloseTo(25.2 / 6, 6);
  });
  it("every jump with its time, trick, side, landed or crash, published score and Counts tag", () => {
    expect(h1.jumpLines[2]).toMatchObject({ seq: 3, at_sec: 200, trick: "Kiteloop", side: "left", landed: true, score: 6, counted: true });
    expect(h1.jumpLines[1]).toMatchObject({ landed: false, score: null });
  });
  it("a heat he lost shows the gap to the winner and to the place that went through", () => {
    const b = rep("b").heats[0];
    expect(b.outcome).toBe("out");
    expect(b.gapToWinner).toBeCloseTo(12.7, 6);
    expect(b.gapToThrough).toBeCloseTo(12.7, 6);
    expect(b.leadOverNext).toBeNull();
  });
  it("the heat length is the clock time without the pauses; the planned length when the heat has no clock", () => {
    const h = heat(1, [], { started_at: "2026-10-19T07:00:00Z", ended_at: "2026-10-19T07:10:30Z", paused_total_sec: 30, duration_sec: 600 });
    expect(heatLength(h)).toBe(600);
    expect(heatLength(heat(1, [], { duration_sec: 480 }))).toBe(480);
  });
  it("a jump with no time is placed evenly along the heat instead of being lost", () => {
    const c = ctxOf([round("R1", "Round 1", 1, [heat(1, [res("a", 1, [att(1, { at: null, counted: true }), att(2, { at: null })]), res("b", 2, [att(1)])])], R1_ADVANCE)]);
    expect(rep("a", c).heats[0].timeline.map((p) => p.x.toFixed(2))).toEqual(["0.33", "0.67"]);
  });
  it("a jump over the attempt cap is not a jump of his", () => {
    const c = ctxOf([round("R1", "Round 1", 1, [heat(1, [res("a", 1, [att(1, { counted: true }), att(2, { ignored: "over_cap" })]), res("b", 2, [att(1)])])], R1_ADVANCE)]);
    expect(rep("a", c).tiles.jumps.value).toBe(1);
  });
  it("only the heats in the data are in the report: a Final that is not published adds nothing", () => {
    const c = scenario();
    c.data.divisions[0].rounds = c.data.divisions[0].rounds.slice(0, 1);
    expect(rep("a", c).heats).toHaveLength(1);
  });
});

describe("report: who gets no report", () => {
  it("a rider whose record says under 18 gets none, and nothing of him is returned", () => {
    const c = scenario();
    c.data.entries = c.data.entries.map((e) => (e.id === "b" ? { ...e, report_withheld: true } : e));
    expect(buildRiderReport(c, "b")).toEqual({ status: "withheld" });
  });
  it("an unknown rider has none", () => {
    expect(buildRiderReport(scenario(), "zzz")).toEqual({ status: "not_found" });
  });
  it("a rider with no published heat yet is told so", () => {
    const c = ctxOf([round("R1", "Round 1", 1, [heat(1, [res("b", 1, [att(1)]), res("c", 2, [att(1)])])], R1_ADVANCE)]);
    expect(buildRiderReport(c, "a")).toMatchObject({ status: "no_heats", name: "Ana Sample" });
  });
  it("'so far' while the event is not complete", () => {
    expect(rep("a").soFar).toBe(true);
    expect(rep("a", ctxOf(scenario().data.divisions[0].rounds, { status: "complete" })).soFar).toBe(false);
  });
});
void ENTRIES;
void FINAL_ADVANCE;
