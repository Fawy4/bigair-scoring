import { describe, expect, it } from "vitest";
import { buildRiderReport } from "./build";
import { scenario } from "./scenario";
import type { RiderReport } from "./types";

const rep = (id: string, ctx = scenario()): RiderReport => {
  const r = buildRiderReport(ctx, id);
  if (r.status !== "ok") throw new Error(`no report for ${id}: ${r.status}`);
  return r;
};

describe("report: tiles with the field's figure beside them (item 4b)", () => {
  const t = rep("a").tiles;
  it("jumps, landed, crashes and the crash rate", () => {
    expect(t.jumps.value).toBe(9);
    expect(t.landed.value).toBe(7);
    expect(t.crashes).toMatchObject({ value: 2 });
    expect(t.crashes.rate).toBeCloseTo(2 / 9, 6);
  });
  it("'of N allowed' only when the division has a limit: 7 a heat over 2 heats = 14", () => {
    expect(t.jumps.allowed).toBe(14);
    expect(rep("a", (() => { const c = scenario(); c.divisionRules.div.attemptCap = null; return c; })()).tiles.jumps.allowed).toBeNull();
  });
  it("the field's figure is the average rider of the division, and of the finalists", () => {
    // jumps per rider: Ana 9, Ben 4, Cy 2, Di 6, Eli 1, Flo 1 → 23 / 6
    expect(t.jumps.field.all).toBeCloseTo(23 / 6, 6);
    // the finalists are Ana and Di: (9 + 6) / 2
    expect(t.jumps.field.finalists).toBeCloseTo(7.5, 6);
  });
  it("different tricks: the two spellings of the double backroll board-off are one trick", () => {
    // Ana landed backroll×2+board-off (twice, spelled two ways), kiteloop, megaloop = 3
    expect(t.differentTricks.value).toBe(3);
  });
  it("loops landed out of tried, with a loop inside any block of the trick", () => {
    expect(t.loops).toMatchObject({ landed: 4, tried: 5 });
  });
  it("the two directions and how many jumps had a direction", () => {
    expect(t.directions).toEqual({ left: 6, right: 3, withDirection: 9, jumps: 9 });
  });
  it("heats won and heats ridden", () => {
    expect(t.heatsWon).toEqual({ value: 1, heats: 2 });
  });
  it("average heat total, best heat total with where, and steadiness (spread of his heat totals)", () => {
    expect(t.averageTotal.value).toBeCloseTo(22.1, 6);
    expect(t.bestTotal.value).toBeCloseTo(22.5, 6);
    expect(t.bestTotal.heatLabel).toBe("Final · Heat 3");
    expect(t.steadiness.value).toBeCloseTo(0.4, 6);
  });
  it("steadiness needs two heats: a rider with one heat has none", () => {
    expect(rep("b").tiles.steadiness.value).toBeNull();
  });
});

describe("report: best three tricks, trick mix, you and the field", () => {
  const r = rep("a");
  it("best three tricks, each trick once with its best published score", () => {
    expect(r.bestTricks.map((b) => [b.trick, b.score])).toEqual([["Kiteloop", 6.5], ["×2 Backroll Board-off", 5.5], ["Megaloop", 4]]);
  });
  it("trick mix by family: landed out of tried, 'Landed' and 'Still to land'", () => {
    const loops = r.mix.find((m) => m.key === "kiteloop")!;
    expect(loops).toMatchObject({ tried: 5, landed: 4, landedTricks: ["Kiteloop", "Megaloop"], stillToLand: [] });
    const frontroll = r.mix.find((m) => m.key === "rotation")!;
    expect(frontroll).toMatchObject({ tried: 1, landed: 0, stillToLand: ["Frontroll"] });
  });
  it("landing rate, attempts used, loops, tricks per heat, average landed trick, impression: rider, all riders, finalists", () => {
    const row = (k: string) => r.compare.find((c) => c.key === k)!;
    expect(row("landing_rate").me).toBeCloseTo(7 / 9, 6);
    expect(row("landing_rate").all).toBeCloseTo((7 / 9 + 0.5 + 0 + 1 + 1 + 0) / 6, 6);
    expect(row("landing_rate").finalists).toBeCloseTo((7 / 9 + 1) / 2, 6);
    expect(row("attempts_used").me).toBeCloseTo(4.5, 6);
    expect(row("loop_share").me).toBeCloseTo(5 / 9, 6);
    expect(row("impression").me).toBeCloseTo(5.75, 6);
  });
  it("field figures are numbers only: nothing in the report names another rider", () => {
    const text = JSON.stringify(r);
    for (const other of ["Ben", "Cy", "Di ", "Eli", "Flo"]) expect(text).not.toContain(other);
  });
});
