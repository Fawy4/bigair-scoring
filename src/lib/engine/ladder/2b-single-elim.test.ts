// Doc 08 §2B — single_elimination generator, heat size 4, top 2 advance, final of 4.
import { describe, expect, it } from "vitest";
import { expandFormat } from "./expand";
import { heatSizes, loadFormat, makeEntrants, publishAll, round, seeds } from "./fixtures";
import { divisionPlacings } from "./placings";

const template = () => loadFormat("heats4-top2-single-elim");

describe("2B single_elimination", () => {
  it("N = 16 → R1 4 heats → Semi 2 heats (8 riders) → Final 1 heat (4); 3 rounds", () => {
    const draw = expandFormat(template(), makeEntrants(16));
    expect(draw.rounds.map((r) => [r.id, r.heats.length])).toEqual([["R1", 4], ["SF", 2], ["F", 1]]);
    expect(draw.rounds.map((r) => r.expectedEntrants)).toEqual([16, 8, 4]);
    expect(heatSizes(draw, "SF")).toEqual([4, 4]);
    expect(heatSizes(draw, "F")).toEqual([4]);
  });

  it("N = 10 → R1 3 heats (3/3/4) → 6 advance → Semi 2 heats (3/3) → Final of 4", () => {
    const draw = expandFormat(template(), makeEntrants(10));
    expect(draw.rounds.map((r) => r.heats.length)).toEqual([3, 2, 1]);
    expect(heatSizes(draw, "R1")).toEqual([3, 3, 4]);
    expect(round(draw, "SF").expectedEntrants).toBe(6);
    expect(heatSizes(draw, "SF")).toEqual([3, 3]);
    expect(heatSizes(draw, "F")).toEqual([4]);
  });

  it("N = 10: the 4 riders eliminated in R1 share 7th, the 2 from the Semis share 5th", () => {
    const placings = divisionPlacings(publishAll(expandFormat(template(), makeEntrants(10))));
    expect(placings).toHaveLength(10);
    const labels = (l: string) => placings.filter((p) => p.label === l).length;
    expect(labels("7=")).toBe(4);
    expect(labels("5=")).toBe(2);
    expect(placings.filter((p) => p.round === "F").map((p) => p.place).sort()).toEqual([1, 2, 3, 4]);
    expect(placings.filter((p) => p.label === "7=").every((p) => p.shared && p.place === 7)).toBe(true);
  });

  it("N = 4 → a single Final", () => {
    const draw = expandFormat(template(), makeEntrants(4));
    expect(draw.rounds.map((r) => r.id)).toEqual(["F"]);
    expect(seeds(draw, "F")).toEqual([[1, 2, 3, 4]]);
  });

  it("N = 2 → a single Final of 2, with a warning that it is below the template minimum", () => {
    const draw = expandFormat(template(), makeEntrants(2));
    expect(draw.rounds.map((r) => r.id)).toEqual(["F"]);
    expect(heatSizes(draw, "F")).toEqual([2]);
    expect(draw.warnings.map((w) => w.type)).toContain("below_template_min");
  });

  it("N = 8 → R1 of 2 heats feeds the Final directly (no Semi with a single heat)", () => {
    const draw = expandFormat(template(), makeEntrants(8));
    expect(draw.rounds.map((r) => r.id)).toEqual(["R1", "F"]);
  });

  it("round durations follow the params: early 10, semi 12, final 15", () => {
    const t = loadFormat("heats4-top2-single-elim", (j) => Object.assign(j.generator.params, { earlyMin: 10, semiMin: 12, finalMin: 15 }));
    const draw = expandFormat(t, makeEntrants(16));
    expect(draw.rounds.map((r) => r.heats[0].durationMin)).toEqual([10, 12, 15]);
    // the shipped preset gives every round 10 minutes (owner, Phase 4b)
    expect(expandFormat(template(), makeEntrants(16)).rounds.map((r) => r.heats[0].durationMin)).toEqual([10, 10, 10]);
    expect(draw.rounds[0].heats[0].breakAfterHeatMin).toBe(3);
    expect(draw.rounds[0].heats[0].breakAfterRoundMin).toBe(5);
    expect(draw.rounds[0].heats.map((h) => h.roundLast)).toEqual([false, false, false, true]);
  });

  it("the ladder always terminates in one final for any N up to 64", () => {
    for (let n = 5; n <= 64; n++) {
      const draw = expandFormat(template(), makeEntrants(n));
      expect(draw.rounds.at(-1)!.heats).toHaveLength(1);
      const placings = divisionPlacings(publishAll(draw));
      expect(placings).toHaveLength(n);
    }
  });
});
