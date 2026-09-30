import { describe, expect, it } from "vitest";
import { expandFormat } from "./index";
import { loadFormat, makeEntrants } from "./fixtures";
import { FormatTemplateSchema } from "@/lib/schemas/format-template";

// Optional per-round heat length for generated ladders ("Round 1: 10 min, Final: 15 min"). Breaks stay global.
const minutes = (draw: ReturnType<typeof expandFormat>, round: string) => [...new Set(draw.rounds.find((r) => r.id === round)!.heats.map((h) => h.durationMin))];

describe("per-round heat length on generated ladders", () => {
  it("knockout: named rounds change, the others keep the generator's heat length", () => {
    const base = loadFormat("heats4-top2-single-elim");
    const plain = expandFormat(base, makeEntrants(14));
    const custom = expandFormat(loadFormat("heats4-top2-single-elim", (j) => (j.roundDurationMin = { R1: 9, F: 20 })), makeEntrants(14));
    expect(minutes(plain, "R1")).toEqual([10]);
    expect(minutes(custom, "R1")).toEqual([9]);
    expect(minutes(custom, "F")).toEqual([20]);
    expect(minutes(custom, "SF")).toEqual(minutes(plain, "SF")); // untouched
  });

  it("second-chance and pools ladders take the same override", () => {
    const d = expandFormat(loadFormat("kota-dingle", (j) => (j.roundDurationMin = { R1: 11, F: 18 })), makeEntrants(18));
    expect(minutes(d, "R1")).toEqual([11]);
    expect(minutes(d, "F")).toEqual([18]);
    const p = expandFormat(loadFormat("pools-to-final", (j) => (j.roundDurationMin = { P1: 14 })), makeEntrants(23));
    expect(minutes(p, "P1")).toEqual([14]);
  });

  it("breaks stay global: the override never changes them", () => {
    const d = expandFormat(loadFormat("heats4-top2-single-elim", (j) => (j.roundDurationMin = { R1: 7 })), makeEntrants(14));
    const base = expandFormat(loadFormat("heats4-top2-single-elim"), makeEntrants(14));
    expect(d.rounds[0].heats.map((h) => [h.breakAfterHeatMin, h.breakAfterRoundMin])).toEqual(base.rounds[0].heats.map((h) => [h.breakAfterHeatMin, h.breakAfterRoundMin]));
  });

  it("a round that does not exist for this field size is ignored", () => {
    const d = expandFormat(loadFormat("heats4-top2-single-elim", (j) => (j.roundDurationMin = { R9: 5 })), makeEntrants(14));
    expect(d.rounds.map((r) => r.id)).toEqual(["R1", "SF", "F"]);
    expect(minutes(d, "R1")).toEqual([10]);
  });

  it("only generated ladders accept it, and each length must be positive", () => {
    const fixed = loadFormat("megaloop-men-16") as unknown as Record<string, unknown>;
    expect(FormatTemplateSchema.safeParse({ ...fixed, roundDurationMin: { R1: 5 } }).success).toBe(false);
    const gen = JSON.parse(JSON.stringify(loadFormat("heats4-top2-single-elim")));
    expect(FormatTemplateSchema.safeParse({ ...gen, roundDurationMin: { R1: 0 } }).success).toBe(false);
    expect(FormatTemplateSchema.safeParse({ ...gen, roundDurationMin: { R1: 12 } }).success).toBe(true);
  });
});
