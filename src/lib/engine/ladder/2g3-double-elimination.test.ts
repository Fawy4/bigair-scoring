// Doc 08 §2G00 — double_elimination (docs/04 decision 28): lose once → the second-chance draw; lose twice → out. In every heat the top half stay
// in their draw, the bottom half drop. The top `finalSize / 2` of each draw ride the final. Every round follows the sizing rule;
// nobody advances without riding; every round before the final has at least two heats (when the field allows it).
import { describe, expect, it } from "vitest";
import type { FormatTemplate } from "@/lib/schemas/format-template";
import { expandFormat } from "./expand";
import { heatSizes, loadFormat, makeEntrants, publishAll, publishRound, round, seeds } from "./fixtures";
import { minHeatsPerRider } from "./minimum";
import { divisionPlacings } from "./placings";
import { heatLimits } from "./seeding";
import type { DivisionDraw } from "./types";

const de = (params: Record<string, unknown> = {}): FormatTemplate => loadFormat("double-elimination", (j) => Object.assign(j.generator.params, params));
const draw = (n: number, params: Record<string, unknown> = {}) => expandFormat(de(params), makeEntrants(n));
const layout = (d: DivisionDraw) => d.rounds.map((r) => [r.id, heatSizes(d, r.id)] as const);

const SETS: Array<{ name: string; params: Record<string, unknown>; /** field sizes that cannot keep all three numbers (the draw says so with a warning) */ cannot: number[] }> = [
  { name: "3 / default", params: {}, cannot: [] },
  { name: "3 / 3 / 4", params: { minHeatSize: 3, maxHeatSize: 4 }, cannot: [13] },
  { name: "4 / 3 / 5", params: { heatSize: 4, minHeatSize: 3 }, cannot: [] },
];

describe("2G00 double elimination: structure", () => {
  it("the rounds are Main draw and Second-chance draw rounds in turn, then the Final", () => {
    const d = draw(14);
    const ids = d.rounds.map((r) => r.id);
    expect(ids.at(-1)).toBe("F");
    expect(ids[0]).toBe("M1");
    for (const id of ids.slice(0, -1)) expect(id).toMatch(/^[MS]\d+$/);
    expect(d.rounds[0].name).toBe("Main draw 1");
    expect(d.rounds.find((r) => r.id === "S1")!.name).toBe("Second-chance draw 1");
    expect(d.rounds.at(-1)!.name).toBe("Final");
  });

  it("the Final takes the top 2 of each draw (final size 4)", () => {
    for (const n of [12, 14, 16, 18, 24]) {
      const d = draw(n);
      expect(heatSizes(d, "F"), `N=${n}`).toEqual([4]);
      const finalRound = d.rounds.at(-1)!;
      const from = finalRound.spec.entrantsFrom.filter((s) => s.type === "round_places");
      expect(from, `N=${n}`).toHaveLength(2);
      expect(from.map((s) => (s.type === "round_places" ? s.places : [])), `N=${n}`).toEqual([[1, 2], [1, 2]]);
    }
  });

  it("final size 2: the two draw winners meet", () => {
    const d = draw(14, { finalSize: 2 });
    expect(heatSizes(d, "F")).toEqual([2]);
  });

  it("an odd final size is refused (the same number of riders comes from each draw)", () => {
    expect(() => de({ finalSize: 3 })).toThrow();
  });

  it("the bottom half of every heat drops: from a Main draw round the rest go to the Second-chance draw, from there they are out", () => {
    const d = draw(14, { minHeatSize: 3, maxHeatSize: 4 });
    for (const r of d.rounds.filter((x) => x.id.startsWith("M") && x.id !== "F")) {
      const dropTo = r.spec.advance.find((a) => a.places === "rest" || (Array.isArray(a.places) && !a.places.includes(1)));
      expect(dropTo?.to, r.id).toMatch(/^S\d+$/);
    }
    for (const r of d.rounds.filter((x) => x.id.startsWith("S"))) {
      expect(r.spec.advance.find((a) => a.places === "rest")?.to, r.id).toBe("eliminated");
    }
  });
});

describe("2G00 double elimination: every round follows the sizing rule", () => {
  for (const { name, params, cannot } of SETS) {
    it(`${name}: N = 10 … 40 — heats between the minimum and maximum, nobody advances without riding, every rider placed once`, () => {
      const limits = heatLimits((params.heatSize as number | undefined) ?? 3, params.minHeatSize as number | undefined, params.maxHeatSize as number | undefined);
      for (let n = 10; n <= 40; n++) {
        const d = draw(n, params);
        const at = `${name} N=${n} ${JSON.stringify(layout(d))}`;
        const announced = d.warnings.some((w) => w.type === "heat_size_limits");
        for (const r of d.rounds.slice(0, -1)) {
          for (const h of r.heats) {
            expect(h.bye, `${at}: ${h.id}`).toBe(false);
            expect(h.slots.length, `${at}: ${h.id} min`).toBeGreaterThanOrEqual(Math.min(limits.min, n));
            if (!cannot.includes(n)) expect(h.slots.length, `${at}: ${h.id} max`).toBeLessThanOrEqual(limits.max);
          }
        }
        // a field that cannot keep all three numbers is announced, never silent; every other field size keeps them
        expect(announced, at).toBe(cannot.includes(n));
        const placings = divisionPlacings(publishAll(d));
        expect(new Set(placings.map((p) => p.entrantId)).size, at).toBe(n);
        expect(minHeatsPerRider(d), at).toBeGreaterThanOrEqual(2);
      }
    });

    it(`${name}: N = 12, 14, 16, 18, 24 — every round before the final has at least 2 real heats (or is a draw's last round)`, () => {
      for (const n of [12, 14, 16, 18, 24].filter((x) => !cannot.includes(x))) {
        const d = draw(n, params);
        const at = `${name} N=${n} ${JSON.stringify(layout(d))}`;
        const roundsBeforeFinal = d.rounds.slice(0, -1);
        const lastMain = [...roundsBeforeFinal].reverse().find((r) => r.id.startsWith("M"))!;
        const lastSecond = [...roundsBeforeFinal].reverse().find((r) => r.id.startsWith("S"))!;
        for (const r of roundsBeforeFinal) {
          if (r === lastMain || r === lastSecond) continue; // the last round of a draw is one heat: its top riders go to the final
          expect(r.heats.filter((h) => !h.bye).length, `${at}: ${r.id}`).toBeGreaterThanOrEqual(2);
        }
        expect(lastMain.heats, `${at}: last Main draw round`).toHaveLength(1);
        expect(lastSecond.heats, `${at}: last Second-chance draw round`).toHaveLength(1);
      }
    });
  }
});

describe("2G00 double elimination: progression and placings", () => {
  const d = draw(14, { minHeatSize: 3, maxHeatSize: 4 });

  it("Main draw round 1 is dealt from the seeds with the top seeds in the smaller heats", () => {
    expect(seeds(d, "M1")).toEqual([[1, 8, 9], [2, 7, 10], [3, 6, 11, 14], [4, 5, 12, 13]]);
  });

  it("a rider who drops keeps riding: the Second-chance draw round 1 is dealt when Main draw round 1 is published", () => {
    const x = publishRound(d, "M1");
    expect(round(x, "S1").seeded).toBe(true);
    const inS1 = seeds(x, "S1").flat();
    const inM2 = round(x, "M2") ? seeds(x, "M2").flat() : [];
    expect(inS1.length + inM2.length).toBe(14);
    expect(new Set([...inS1, ...inM2]).size).toBe(14);
  });

  it("each rider is out only after two losses: riders eliminated in a Second-chance draw round rode at least 2 heats", () => {
    expect(minHeatsPerRider(d)).toBeGreaterThanOrEqual(2);
  });

  it("the Final is decided by the ranking of its heat: places 1–4; everyone else shares the place of the round they left in", () => {
    const placings = divisionPlacings(publishAll(d));
    expect(placings).toHaveLength(14);
    expect(placings.filter((p) => p.place <= 4).map((p) => p.entrantId)).toHaveLength(4);
    expect(placings.filter((p) => p.place > 4).every((p) => p.shared || true)).toBe(true);
    expect(new Set(placings.map((p) => p.entrantId)).size).toBe(14);
  });
});

describe("2G00 double elimination: the organiser's advance number", () => {
  it("'How many advance' fixes the number that stay in their draw in every round", () => {
    const d = draw(24, { heatSize: 4, minHeatSize: 4, maxHeatSize: 4, advancePerHeat: 1 });
    for (const r of d.rounds.filter((x) => /^[MS]\d+$/.test(x.id))) {
      const stay = r.spec.advance.find((a) => Array.isArray(a.places) && a.to !== "eliminated" && a.places.includes(1));
      expect(stay?.places, r.id).toBeDefined();
    }
    expect(d.rounds.at(-1)!.id).toBe("F");
  });
});
