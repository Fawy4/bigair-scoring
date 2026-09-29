import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScoringModel, ScoringModelError } from "./scoring-model";

const PRESET_DIR = join(process.cwd(), "presets", "scoring");
const presetFiles = readdirSync(PRESET_DIR).filter((f) => f.endsWith(".json"));
const load = (file: string) => JSON.parse(readFileSync(join(PRESET_DIR, file), "utf8"));

describe("ScoringModel schema (doc 08 §1F)", () => {
  it("finds all seven presets", () => {
    expect(presetFiles).toHaveLength(7);
  });

  it.each(presetFiles)("parses %s", (file) => {
    const model = parseScoringModel(load(file));
    expect(model.id).toBe(file.replace(/\.json$/, ""));
  });

  it("applies defaults the presets leave out", () => {
    const kota = parseScoringModel(load("kota-best3-impression.json"));
    expect(kota.heat.impression?.required).toBe(true);
    expect(kota.heat.maxAttemptsPerRider).toBeNull();
    expect(kota.heat.duplicateWindowSec).toBe(20);
    expect(kota.heat.counting).toEqual({ type: "best_n", n: 3, distinctTrickNames: false });
  });

  it("legacy preset keeps step 0.5, a 7-attempt cap, and says the step is editable per event", () => {
    const legacy = parseScoringModel(load("legacy-kol-best3-variety.json"));
    expect(legacy.trick.scale.step).toBe(0.5);
    expect(legacy.heat.maxAttemptsPerRider).toBe(7);
    expect(legacy.description).toMatch(/editable per event/i);
  });

  it('rejects combine = "sum" when criteria maximums do not add up to trick.scale.max (1C)', () => {
    const pukl = load("pukl-points.json");
    pukl.trick.criteria[3].scale.max = 2; // 3 + 3 + 3 + 2 = 11 ≠ 10
    expect(() => parseScoringModel(pukl)).toThrow(ScoringModelError);
    expect(() => parseScoringModel(pukl)).toThrow(/add up to 11/);
  });

  it("rejects duplicate criterion keys", () => {
    const kota = load("kota-best3-impression.json");
    kota.trick.criteria[1].key = "height";
    expect(() => parseScoringModel(kota)).toThrow(/unique/);
  });

  it("rejects height_criterion without exactly one sensorFill criterion", () => {
    const megaloop = load("megaloop-single-best.json");
    megaloop.heightSensor.use = "height_criterion";
    expect(() => parseScoringModel(megaloop)).toThrow(/exactly one criterion/);
  });

  it("rejects a percent/points interference penalty without a value", () => {
    const m = load("megaloop-single-best.json");
    delete m.modifiers.interference.value;
    expect(() => parseScoringModel(m)).toThrow(/needs a value/);
  });

  it("rejects zero criterion weights but allows trickWeight 0", () => {
    const kota = load("kota-best3-impression.json");
    kota.trick.criteria[0].weight = 0;
    expect(() => parseScoringModel(kota)).toThrow();
    expect(parseScoringModel(load("overall-impression.json")).heat.trickWeight).toBe(0);
  });
});
