import { describe, expect, it } from "vitest";
import dingle from "../../../presets/formats/kota-dingle.json";
import single from "../../../presets/formats/heats4-top2-single-elim.json";
import pools from "../../../presets/formats/pools-to-final.json";
import { parseFormatTemplate } from "@/lib/schemas/format-template";
import { advanceTargets, newCustomFormat, newRound, validateFormat } from "./custom";
import { placesLabel, previewFormat } from "./preview";
import { copy } from "@/lib/ui-copy";

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
    expect(p.ladder.map((c) => c.summary)).toEqual(["4 heats · 3–4 riders · 10 min", "2 heats · 4 riders · 12 min", "1 heat · 4 riders · 15 min"]);
    expect(p.ladder[0].heats.map((h) => h.size)).toEqual([3, 3, 4, 4]); // smaller heats for the top seeds
    expect(p.ladder[0].routes).toEqual(["1st–2nd → SF", "the rest → out"]);
    expect(p.ladder[2].routes).toEqual(["the rest → final placing"]);
  });

  it("the number of rounds and heats matches the text preview", () => {
    for (const [file, n] of [[single, 14], [dingle, 18], [pools, 23]] as const) {
      const p = previewFormat(parseFormatTemplate(file), n);
      expect(p.ladder).toHaveLength(p.rounds.length);
      expect(p.ladder.reduce((s, c) => s + c.heats.filter((h) => !h.advancing).length, 0)).toBe(p.totalHeats);
    }
  });

  it("pools: everyone rides once, then the best N of all heats go to the final", () => {
    const p = previewFormat(parseFormatTemplate(pools), 23);
    expect(p.ladder[0].routes).toEqual(["best 6 of all heats → F", "the rest → out"]);
  });

  it("second chance: winners go on, 2nd and 3rd get another heat", () => {
    const p = previewFormat(parseFormatTemplate(dingle), 18);
    expect(p.ladder[0].routes.join(" | ")).toMatch(/1st → R3.*2nd–3rd → Second chance/);
  });

  it("place lists read naturally", () => {
    expect(placesLabel([1])).toBe("1st");
    expect(placesLabel([1, 2, 3])).toBe("1st–3rd");
    expect(placesLabel([1, 3])).toBe("1st, 3rd");
    expect(placesLabel([11, 12])).toBe("11th–12th");
    expect(placesLabel([2, 3])).toBe("2nd–3rd");
  });
});

describe("plain words in the ladder: heat names, placeholders, advancing without riding", () => {
  const knock = previewFormat(parseFormatTemplate(single), 14);
  const second = previewFormat(parseFormatTemplate(dingle), 14);
  const pool = previewFormat(parseFormatTemplate(pools), 23);

  it("heats are named by round and place inside it", () => {
    expect(knock.ladder[0].heats.map((h) => h.name)).toEqual(["R1 H1", "R1 H2", "R1 H3", "R1 H4"]);
    expect(second.ladder.find((c) => c.id === "R2")!.heats[0].name).toBe("Second chance H1");
  });

  it("the first round has no placeholders; a later round reads '1st H1' when it comes from the previous round", () => {
    expect(knock.ladder[0].heats.every((h) => h.from.length === 0)).toBe(true);
    expect(knock.ladder[1].heats[0].from).toEqual(["1st H1", "1st H4", "2nd H1", "2nd H4"]);
    expect(knock.ladder[2].heats[0].from).toEqual(["1st H1", "1st H2", "2nd H1", "2nd H2"]);
  });

  it("a source in another round names the round: '1st R1 H1'", () => {
    const r3 = second.ladder.find((c) => c.id === "R3")!;
    expect(r3.heats[0].from[0]).toBe("1st R1 H1");
    expect(r3.heats[0].from[1]).toMatch(/^1st H\d$/); // the previous round: no round name
    expect(second.ladder.find((c) => c.id === "R2")!.heats.flatMap((h) => h.from).every((x) => /^[23](nd|rd) H\d$/.test(x))).toBe(true);
  });

  it("pools: the final comes from all pool heats", () => {
    expect(pool.ladder[1].heats[0].from[0]).toBe("1st of all heats");
  });

  it("a rider who advances without riding is labelled so, and the word 'bye' never appears", () => {
    const advancing = second.ladder.flatMap((c) => c.heats).filter((h) => h.advancing);
    expect(advancing.length).toBeGreaterThan(0);
    expect(copy.ladder.advancesWithoutRiding).toBe("Advances without riding");
    expect(second.sentence).toMatch(/advancing without riding/);
    const words = (p: typeof knock) => [p.sentence, ...p.warnings, ...p.ladder.flatMap((c) => [c.name, c.summary, ...c.routes, ...c.heats.flatMap((h) => [h.name, ...h.from])])];
    const everything = [knock, second, pool].flatMap(words).join(" | ");
    expect(everything).not.toMatch(/\bbyes?\b/i);
    expect(everything).not.toMatch(/repechage|man-on-man|dingle/i);
  });

  it("the placeholder wording helper", () => {
    expect(copy.ladder.slotFrom(1, null, 1)).toBe("1st H1");
    expect(copy.ladder.slotFrom(2, null, 3)).toBe("2nd H3");
    expect(copy.ladder.slotFrom(1, "R2", 5)).toBe("1st R2 H5");
    expect(copy.ladder.slotFrom(3, null, 0)).toBe("3rd of all heats");
  });

  it("minimum heats per rider is in the preview: 1 for knockout and pools, at least 2 with a second chance", () => {
    expect(knock.minHeatsPerRider).toBe(1);
    expect(pool.minHeatsPerRider).toBe(1);
    expect(second.minHeatsPerRider).toBeGreaterThanOrEqual(2);
    expect(copy.formatSimple.minHeats(2)).toBe("Minimum heats per rider: 2");
  });
});
