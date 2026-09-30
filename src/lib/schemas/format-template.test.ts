import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FormatTemplateError, parseFormatTemplate } from "./format-template";

const DIR = join(process.cwd(), "presets", "formats");
const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
const load = (file: string) => JSON.parse(readFileSync(join(DIR, file), "utf8"));

const base = () => load("megaloop-women-6.json");
const gen = (params: Record<string, unknown>, type = "single_elimination") => ({
  ...load("heats4-top2-single-elim.json"),
  generator: { type, params },
});

describe("FormatTemplate schema — presets", () => {
  it("finds all nine presets (five earlier ones and the four new generators)", () => {
    expect(files).toHaveLength(9);
  });

  it.each(files)("parses %s", (file) => {
    const t = parseFormatTemplate(load(file));
    expect(t.id).toBe(file.replace(/\.json$/, ""));
  });

  it("applies generator defaults the presets leave out", () => {
    const pools = parseFormatTemplate(load("pools-to-final.json"));
    expect(pools.generator?.type).toBe("pools_to_final");
    if (pools.generator?.type === "pools_to_final") {
      expect(pools.generator.params.poolRounds).toBe(1);
      expect(pools.generator.params.poolCombine).toBe("best");
    }
    const megaloop = parseFormatTemplate(load("megaloop-men-16.json"));
    expect(megaloop.rounds?.[0].minRidersToRun).toBe(1);
    expect(megaloop.rounds?.[0].heatCountOverride).toBeUndefined();
  });
});

describe("FormatTemplate schema — refinements reject bad examples", () => {
  it("advancePerHeat must be smaller than heatSize", () => {
    expect(() => parseFormatTemplate(gen({ heatSize: 4, advancePerHeat: 4 }))).toThrow(FormatTemplateError);
    expect(() => parseFormatTemplate(gen({ heatSize: 4, advancePerHeat: 3 }))).not.toThrow();
  });

  it("pools heatSize is capped at 10 and poolRounds must be 1 or 2", () => {
    expect(() => parseFormatTemplate(gen({ heatSize: 11 }, "pools_to_final"))).toThrow(FormatTemplateError);
    expect(() => parseFormatTemplate(gen({ poolRounds: 3 }, "pools_to_final"))).toThrow(FormatTemplateError);
    expect(() => parseFormatTemplate(gen({ poolRounds: 2, poolCombine: "sum" }, "pools_to_final"))).not.toThrow();
  });

  it("random seeding is only allowed on a round fed by the seed list", () => {
    const t = base();
    t.rounds[1].seeding = "random"; // SF is fed by R1 places
    expect(() => parseFormatTemplate(t)).toThrow(/random/);
    const ok = base();
    ok.rounds[0].seeding = "random";
    expect(() => parseFormatTemplate(ok)).not.toThrow();
  });

  it("advance.to must name an existing round", () => {
    const t = base();
    t.rounds[0].advance[0].to = "QF";
    expect(() => parseFormatTemplate(t)).toThrow(/unknown round "QF"/);
  });

  it("entrantsFrom must name an existing round", () => {
    const t = base();
    t.rounds[1].entrantsFrom[0].round = "R9";
    expect(() => parseFormatTemplate(t)).toThrow(/unknown round "R9"/);
  });

  it("heatCountOverride must be at least 1", () => {
    const t = base();
    t.rounds[0].heatCountOverride = 0;
    expect(() => parseFormatTemplate(t)).toThrow(FormatTemplateError);
    t.rounds[0].heatCountOverride = 2;
    expect(() => parseFormatTemplate(t)).not.toThrow();
  });

  it("fixed needs rounds, generator needs a generator", () => {
    const noRounds = base();
    delete noRounds.rounds;
    expect(() => parseFormatTemplate(noRounds)).toThrow(/rounds/);
    const noGen = load("pools-to-final.json");
    delete noGen.generator;
    expect(() => parseFormatTemplate(noGen)).toThrow(/generator/);
  });
});
