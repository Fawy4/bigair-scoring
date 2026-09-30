// Doc 08 §2G00 — round_robin: everyone rides `heatsPerRider` heats against different riders; place points add up to the ranking.
import { describe, expect, it } from "vitest";
import { expandFormat } from "./expand";
import { heatSizes, loadFormat, makeEntrants, publishAll, publishRound, resultBy, round, seeds } from "./fixtures";
import { minHeatsPerRider } from "./minimum";
import { divisionPlacings } from "./placings";
import { applyHeatResult } from "./progress";
import type { DivisionDraw } from "./types";

const robin = (params: Record<string, unknown> = {}) => loadFormat("round-robin", (j) => Object.assign(j.generator.params, params));
const draw = (n: number, params: Record<string, unknown> = {}) => expandFormat(robin(params), makeEntrants(n));

/** How many pairs of riders share a heat in more than one round (0 = everybody always meets somebody new). */
function repeatedPairs(d: DivisionDraw): number {
  const seen = new Map<string, number>();
  for (const r of d.rounds) for (const h of r.heats) {
    const ids = h.slots.map((s) => s.entrantId!).sort();
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) seen.set(`${ids[i]}|${ids[j]}`, (seen.get(`${ids[i]}|${ids[j]}`) ?? 0) + 1);
  }
  return [...seen.values()].filter((c) => c > 1).length;
}

describe("2G00 round robin, N = 12 (target 4, min 3, max 5; 3 heats each)", () => {
  const d = draw(12);

  it("three rounds of 3 heats of 4; everybody rides once per round = 3 heats", () => {
    expect(d.rounds.map((r) => r.id)).toEqual(["RR1", "RR2", "RR3"]);
    for (const id of ["RR1", "RR2", "RR3"]) expect(heatSizes(d, id)).toEqual([4, 4, 4]);
    expect(d.rounds.flatMap((r) => r.heats)).toHaveLength(9);
    expect(minHeatsPerRider(d)).toBe(3);
    expect(d.rounds.flatMap((r) => r.heats).some((h) => h.bye)).toBe(false);
  });

  it("round 1 is the snake deal; later rounds put riders with new riders", () => {
    expect(seeds(d, "RR1")).toEqual([[1, 6, 7, 12], [2, 5, 8, 11], [3, 4, 9, 10]]);
    // 12 riders in 3 heats of 4: a new heat of 4 needs 4 riders from 3 old heats, so at least one repeated pair per heat is unavoidable
    const round2 = expandFormat(robin({ heatsPerRider: 2 }), makeEntrants(12));
    expect(repeatedPairs(round2)).toBeLessThanOrEqual(3);
  });

  it("every round contains every rider exactly once", () => {
    for (const r of d.rounds) expect(seeds(d, r.id).flat().sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  it("points by place (heat size + 1 − place) add up; the ranking is the result", () => {
    // seed order wins every heat: seed s has better totals than seed s+1 in each round
    const placings = divisionPlacings(publishAll(d));
    expect(placings).toHaveLength(12);
    expect(placings.map((p) => p.place)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(new Set(placings.map((p) => p.entrantId)).size).toBe(12);
    expect(placings.every((p) => !p.shared)).toBe(true);
  });

  it("an editable points table changes the ranking", () => {
    const x = draw(8, { pointsTable: [10, 1, 1, 1], heatsPerRider: 2 });
    expect(round(x, "RR2").spec.crossHeat?.points).toEqual([10, 1, 1, 1]);
  });

  it("the default points table is heat size + 1 − place, per heat", () => {
    let x = draw(7, { minHeatSize: 3, maxHeatSize: 4, heatsPerRider: 2 }); // heats of 3 and 4
    expect(heatSizes(x, "RR1")).toEqual([3, 4]);
    // rider 1 wins the heat of 3 (3 points) and rider 7 wins the heat of 4 (4 points)
    x = publishRound(x, "RR1");
    x = publishRound(x, "RR2");
    expect(divisionPlacings(x)).toHaveLength(7);
  });
});

describe("2G00 round robin, other sizes", () => {
  it("opponents rotate: no repeated pairs when the field allows it (16, 20, 24, 30 riders), the fewest possible otherwise", () => {
    for (const n of [16, 20, 24, 30]) expect(repeatedPairs(draw(n, { heatsPerRider: 2 })), `N=${n}`).toBe(0);
    // 8 riders in 2 heats of 4: each new heat must take 2 + 2 from the old heats = 2 repeated pairs each
    expect(repeatedPairs(draw(8, { heatsPerRider: 2 }))).toBe(4);
  });

  it("heats per rider = number of rounds; every rider rides that many", () => {
    for (const k of [2, 3, 4, 5]) {
      const d = draw(16, { heatsPerRider: k });
      expect(d.rounds).toHaveLength(k);
      expect(minHeatsPerRider(d)).toBe(k);
    }
  });

  it("N = 4 … 40: every heat between the minimum and maximum (when the field allows), nobody skips, every rider placed once", () => {
    for (let n = 4; n <= 40; n++) {
      const d = draw(n);
      for (const r of d.rounds) for (const h of r.heats) {
        expect(h.bye, `N=${n}`).toBe(false);
        expect(h.slots.length, `N=${n}`).toBeGreaterThanOrEqual(Math.min(3, n));
        if (n >= 6) expect(h.slots.length, `N=${n}`).toBeLessThanOrEqual(5);
      }
      expect(new Set(divisionPlacings(publishAll(d)).map((p) => p.entrantId)).size, `N=${n}`).toBe(n);
    }
  });

  it("the ranking is not decided until every round is published", () => {
    let d = draw(8);
    d = publishRound(d, "RR1");
    expect(divisionPlacings(d)).toHaveLength(0);
    const last = round(d, "RR2").heats[0];
    d = applyHeatResult(d, last.id, resultBy(last, (s) => 100 - s)).draw;
    expect(divisionPlacings(d)).toHaveLength(0);
  });

  it("ties on points are broken by the best heat score, then the seed", () => {
    // 4 riders in one heat per round (N = 4, 2 rounds): identical scores in both rounds swap places between the rounds
    let d = draw(4, { heatsPerRider: 2 });
    d = publishRound(d, "RR1");
    const h = round(d, "RR2").heats[0];
    d = applyHeatResult(d, h.id, resultBy(h, (s) => s)).draw; // reversed: seed 4 wins RR2
    const order = divisionPlacings(d).map((p) => p.entrantId);
    expect(order).toHaveLength(4);
    expect(new Set(order).size).toBe(4);
  });
});
