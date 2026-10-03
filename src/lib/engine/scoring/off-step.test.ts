// A1a-3 (docs/AUDIT.md): the engine never blanks a heat. A value that is off the step is rounded to the nearest step (halves up) and noted;
// one outside the scale is brought to the nearest end and noted; one that is not a number, or a criteria mark that cannot be read, is left out
// (that judge is "missing", which blocks Publish) and noted. Totals always appear.
import { describe, expect, it } from "vitest";
import { computeHeat, explain, nearestOnScale } from "./index";
import { hetx, impressions, J3, landed, preset } from "./fixtures";
import type { RiderInput } from "./types";

const model = preset("kota-best3-impression");
const scale = { min: 0, max: 10, step: 0.1 };
const heat = (riders: RiderInput[]) => computeHeat(model, { panelJudgeIds: J3, riders });
const ok = (id: string): RiderInput => ({ riderId: id, attempts: [landed(1, J3.map(() => hetx(6, 6, 6, 6)))], impressionMarks: impressions([5, 5, 5]) });

describe("nearestOnScale", () => {
  it("leaves a value on the step alone", () => {
    expect(nearestOnScale(7.3, scale)).toEqual({ value: 7.3, problem: null });
    expect(nearestOnScale(0, scale)).toEqual({ value: 0, problem: null });
    expect(nearestOnScale(10, scale)).toEqual({ value: 10, problem: null });
  });
  it("rounds an off-step value to the nearest step, halves up", () => {
    expect(nearestOnScale(7.25, scale)).toEqual({ value: 7.3, problem: "off_step" });
    expect(nearestOnScale(7.24, scale)).toEqual({ value: 7.2, problem: "off_step" });
    expect(nearestOnScale(7.05, scale)).toEqual({ value: 7.1, problem: "off_step" });
    expect(nearestOnScale(9.96, scale)).toEqual({ value: 10, problem: "off_step" });
  });
  it("counts steps from the scale's minimum, not from zero", () => {
    expect(nearestOnScale(5.7, { min: 5, max: 10, step: 0.5 })).toEqual({ value: 5.5, problem: "off_step" });
    expect(nearestOnScale(5.75, { min: 5, max: 10, step: 0.5 })).toEqual({ value: 6, problem: "off_step" });
  });
  it("brings a value outside the scale to its nearest end", () => {
    expect(nearestOnScale(10.5, scale)).toEqual({ value: 10, problem: "out_of_range" });
    expect(nearestOnScale(-0.1, scale)).toEqual({ value: 0, problem: "out_of_range" });
  });
  it("gives no value for something that is not a number", () => {
    expect(nearestOnScale(Number.NaN, scale)).toEqual({ value: null, problem: "not_a_number" });
    expect(nearestOnScale(Number.POSITIVE_INFINITY, scale)).toEqual({ value: null, problem: "not_a_number" });
  });
  it("never returns a value above the maximum when the maximum is not on the step", () => {
    expect(nearestOnScale(9.9, { min: 0, max: 9.9, step: 0.5 }).value).toBe(9.5);
  });
});

describe("computeHeat with a bad mark", () => {
  it("an off-step Impression 7.25 counts as 7.3 and is said so; every rider still has a total", () => {
    const bad: RiderInput = { riderId: "B", attempts: [], impressionMarks: [{ judgeId: "J1", value: 7.25 }, { judgeId: "J2", value: 7.3 }, { judgeId: "J3", value: 7.3 }] };
    const res = heat([ok("A"), bad]);
    expect(res.riders.map((r) => r.total)).toEqual([11, 7.3]);
    const b = res.riders[1];
    expect(b.adjustedMarks).toEqual([{ judgeId: "J1", attemptSeq: null, label: "Impression", given: 7.25, used: 7.3, problem: "off_step", step: 0.1, min: 0, max: 10 }]);
    expect(explain(b, model).join("\n")).toContain("J1: Impression 7.25 is not on the 0.1 step, counted as 7.3");
  });

  it("a criterion of 10.5 is counted as 10 and is said so; the trick still scores", () => {
    const res = heat([{ riderId: "A", attempts: [{ seq: 2, status: "landed", marks: J3.map((j, i) => ({ judgeId: j, value: i === 0 ? { height: 10.5, extremity: 6, technicality: 6, execution: 6 } : hetx(6, 6, 6, 6) })) }] }]);
    expect(res.riders[0].adjustedMarks).toEqual([{ judgeId: "J1", attemptSeq: 2, label: "Height", given: 10.5, used: 10, problem: "out_of_range", step: 0.1, min: 0, max: 10 }]);
    expect(res.riders[0].allAttempts[0].score).toBe(6.33); // J1 (10+6+6+6)/4 = 7.0, then the mean of 7.0, 6, 6
    expect(explain(res.riders[0], model).join("\n")).toContain("J1: Height on attempt #2 is 10.5, outside 0–10, counted as 10");
  });

  it("a mark that is not a number is left out: that judge is missing, Publish stays blocked, totals still appear", () => {
    const att = { seq: 1, status: "landed" as const, marks: J3.map((j, i) => ({ judgeId: j, value: i === 0 ? { height: Number.NaN, extremity: 6, technicality: 6, execution: 6 } : hetx(6, 6, 6, 6) })) };
    const res = heat([{ riderId: "A", attempts: [att], impressionMarks: impressions([5, 5, 5]) }, ok("B")]);
    expect(res.riders.map((r) => r.total)).toEqual([11, 11]);
    expect(res.riders[0].adjustedMarks[0]).toMatchObject({ judgeId: "J1", attemptSeq: 1, given: Number.NaN, used: null, problem: "not_a_number" });
    expect(res.publishBlockers).toContainEqual({ type: "score_missing", judge: "J1", rider: "A", attemptSeq: 1 });
    expect(explain(res.riders[0], model).join("\n")).toContain("not counted");
  });

  it("a criteria mark that cannot be read (a missing criterion) is left out instead of blanking the heat", () => {
    const att = { seq: 1, status: "landed" as const, marks: J3.map((j, i) => ({ judgeId: j, value: i === 0 ? ({ height: 6, extremity: 6 } as never) : hetx(6, 6, 6, 6) })) };
    const res = heat([{ riderId: "A", attempts: [att], impressionMarks: impressions([5, 5, 5]) }, ok("B")]);
    expect(res.riders.map((r) => r.total)).toEqual([11, 11]);
    expect(res.riders[0].adjustedMarks[0]).toMatchObject({ judgeId: "J1", problem: "unreadable", used: null });
    expect(res.publishBlockers).toContainEqual({ type: "score_missing", judge: "J1", rider: "A", attemptSeq: 1 });
  });

  it("clean heats carry no adjustments and no extra explanation lines", () => {
    const res = heat([ok("A"), ok("B")]);
    expect(res.riders.every((r) => r.adjustedMarks.length === 0)).toBe(true);
    expect(explain(res.riders[0], model).join("\n")).not.toMatch(/step|counted as/);
  });

  it("a single-mark model (Club quick) rounds a bad trick mark too", () => {
    const m = preset("club-quick-best2");
    const res = computeHeat(m, { panelJudgeIds: J3, riders: [{ riderId: "A", attempts: [{ seq: 1, status: "landed", marks: J3.map((j) => ({ judgeId: j, value: j === "J1" ? 7.25 : 7.5 })) }] }] });
    expect(res.riders[0].total).toBeGreaterThan(0);
    expect(res.riders[0].adjustedMarks).toHaveLength(1);
  });
});
