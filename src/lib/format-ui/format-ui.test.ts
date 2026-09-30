import { describe, expect, it } from "vitest";
import dingle from "../../../presets/formats/kota-dingle.json";
import single from "../../../presets/formats/heats4-top2-single-elim.json";
import pools from "../../../presets/formats/pools-to-final.json";
import { parseFormatTemplate } from "@/lib/schemas/format-template";
import { advanceTargets, newCustomFormat, newRound, validateFormat } from "./custom";
import { placesLabel, previewFormat } from "./preview";

describe("format preview", () => {
  it("describes the real draw the engine deals", () => {
    const p = previewFormat(parseFormatTemplate(single), 14);
    expect(p.ok).toBe(true);
    expect(p.sentence.startsWith("With 14 riders: R1 ")).toBe(true);
    expect(p.totalHeats).toBe(p.rounds.reduce((s, r) => s + r.heats, 0));
    // Numbers come from expandFormat, not from a second calculation: 14 riders in heats of 4 → 4 heats of 3–4
    expect(p.rounds[0]).toMatchObject({ heats: 4, minSize: 3, maxSize: 4 });
    expect(p.sentence).toContain("R1 4 heats of 3–4");
  });

  it("the last round is a single heat and the total is added up", () => {
    const p = previewFormat(parseFormatTemplate(dingle), 18);
    expect(p.rounds[p.rounds.length - 1].heats).toBe(1);
    expect(p.sentence).toMatch(/\(\d+ heats\)$/);
    expect(p.ridingMinutes).toBeGreaterThan(0);
  });

  it("pools: each pool is one heat of the pool size", () => {
    const p = previewFormat(parseFormatTemplate(pools), 10);
    expect(p.rounds[0]).toMatchObject({ heats: 1, minSize: 10 });
  });

  it("small fields and the engine's own warnings are passed on", () => {
    const p = previewFormat(parseFormatTemplate(dingle), 3);
    expect(p.ok).toBe(true);
    expect(p.warnings.join(" ")).toMatch(/below|minimum|fewer|small/i);
  });

  it("no riders: says the format cannot run, never crashes", () => {
    const p = previewFormat(parseFormatTemplate(single), 0);
    expect(p.ok).toBe(false);
    expect(p.sentence).toMatch(/^With 0 riders: this format cannot run/);
  });

  it("singular wording", () => {
    expect(previewFormat(parseFormatTemplate(single), 1).sentence).toMatch(/^With 1 rider: /);
  });
});

describe("custom format builder", () => {
  it("the starting format is valid and previews for many field sizes without failing", () => {
    const t = validateFormat(newCustomFormat());
    expect(t.success).toBe(true);
    for (const n of [4, 6, 10, 14, 24]) {
      const p = previewFormat(parseFormatTemplate(newCustomFormat()), n);
      expect(p.ok, `n=${n}`).toBe(true);
      expect(p.rounds[p.rounds.length - 1].heats, `final for n=${n}`).toBe(1);
    }
  });

  it("adding a round keeps the format valid and takes riders from the previous round", () => {
    const base = newCustomFormat() as { rounds: Array<Record<string, unknown>> };
    const added = newRound(base.rounds.map((r) => r.id as string), "F");
    expect(added.id).toBe("R3");
    base.rounds.push(added);
    expect(validateFormat(base).success).toBe(true);
  });

  it("a round that points at a round which does not exist is explained", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = newCustomFormat() as { rounds: Array<Record<string, any>> };
    t.rounds[1].entrantsFrom = [{ type: "round_places", round: "R9", places: [1] }];
    const r = validateFormat(t);
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues.map((i) => i.message).join(" ")).toMatch(/unknown round "R9"/);
  });

  it("targets for 'where each place goes'", () => {
    expect(advanceTargets(["R1", "R2", "F"], "R1")).toEqual(["R2", "F", "eliminated", "final_placing"]);
  });
});

describe("ladder diagram model", () => {
  it("14 riders, heats of 4, top 2: three rounds with their heats and where places go", () => {
    const p = previewFormat(parseFormatTemplate(single), 14);
    expect(p.ladder.map((c) => c.shortName)).toEqual(["R1", "SF", "F"]);
    expect(p.ladder.map((c) => c.summary)).toEqual(["4 heats · 3–4 riders", "2 heats · 4 riders", "1 heat · 4 riders"]);
    expect(p.ladder[0].heats.map((h) => h.size)).toEqual([3, 3, 4, 4]); // smaller heats for the top seeds
    expect(p.ladder[0].routes).toEqual(["1st–2nd → SF", "the rest → out"]);
    expect(p.ladder[2].routes).toEqual(["the rest → final placing"]);
  });

  it("the number of rounds and heats matches the text preview", () => {
    for (const [file, n] of [[single, 14], [dingle, 18], [pools, 23]] as const) {
      const p = previewFormat(parseFormatTemplate(file), n);
      expect(p.ladder).toHaveLength(p.rounds.length);
      expect(p.ladder.reduce((s, c) => s + c.heats.filter((h) => !h.bye).length, 0)).toBe(p.totalHeats);
    }
  });

  it("pools: everyone rides once, then the best N of all heats go to the final", () => {
    const p = previewFormat(parseFormatTemplate(pools), 23);
    expect(p.ladder[0].routes).toEqual(["best 6 of all heats → F", "the rest → out"]);
  });

  it("second chance: winners go on, 2nd and 3rd get another heat", () => {
    const p = previewFormat(parseFormatTemplate(dingle), 18);
    expect(p.ladder[0].routes.join(" | ")).toMatch(/1st → R3.*2nd–3rd → R2/);
  });

  it("place lists read naturally", () => {
    expect(placesLabel([1])).toBe("1st");
    expect(placesLabel([1, 2, 3])).toBe("1st–3rd");
    expect(placesLabel([1, 3])).toBe("1st, 3rd");
    expect(placesLabel([11, 12])).toBe("11th–12th");
    expect(placesLabel([2, 3])).toBe("2nd–3rd");
  });
});
