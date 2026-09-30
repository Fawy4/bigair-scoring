import { describe, expect, it } from "vitest";
import scoring from "../../../presets/scoring/kota-best3-impression.json";
import format from "../../../presets/formats/kota-dingle.json";
import { asNewPreset, describeJsonError, exportPreset, importFormatTemplate, importScoringModel, slugKey } from "./io";

const text = (o: unknown) => JSON.stringify(o, null, 2);

describe("export", () => {
  it("writes pretty JSON with a readable file name", () => {
    const { filename, text: t } = exportPreset(scoring, "KOTA – best 3 + impression");
    expect(filename).toBe("kota-best-3-impression.json");
    expect(JSON.parse(t)).toEqual(scoring);
    expect(t.endsWith("\n")).toBe(true);
  });
  it("what is exported can be imported again", () => {
    const r = importScoringModel(exportPreset(scoring, "x").text);
    expect(r.ok).toBe(true);
  });
});

describe("import: readable errors", () => {
  it("valid files import", () => {
    const s = importScoringModel(text(scoring));
    expect(s.ok && s.name).toBe(scoring.name);
    expect(importFormatTemplate(text(format)).ok).toBe(true);
  });

  it("broken JSON says where", () => {
    const r = importScoringModel('{\n  "id": "x",\n  "name": "y" "oops": 1\n}');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problems[0]).toMatch(/not valid JSON \(line 3, column \d+\)/);
  });

  it("not an object", () => {
    expect(importScoringModel("[1,2]")).toEqual({ ok: false, problems: ["A scoring model file must contain one JSON object (starting with “{”)."] });
    expect(importFormatTemplate("42").ok).toBe(false);
  });

  it("lists every problem with its place in the file, in plain words", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bad = structuredClone(scoring) as Record<string, any>;
    bad.heat.counting.n = 0;
    bad.panel.minJudges = "three";
    delete bad.trick.scale;
    const r = importScoringModel(text(bad));
    expect(r.ok).toBe(false);
    const problems = !r.ok ? r.problems : [];
    expect(problems).toContain("heat › counting › n: Must be at least 1");
    expect(problems).toContain("panel › minJudges: Enter a number");
    expect(problems.some((p) => p.startsWith("trick › scale:"))).toBe(true);
  });

  it("catches a rule the schema checks across fields", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bad = structuredClone(scoring) as Record<string, any>;
    bad.heat.counting = { type: "best_per_category", maxPerCategory: 1, perCategoryMax: { nope: 2 } };
    const r = importScoringModel(text(bad));
    expect(!r.ok && r.problems.join("\n")).toMatch(/perCategoryMax names "nope"/);
  });

  it("a format file offered as a scoring model is recognised", () => {
    const r = importScoringModel(text(format));
    expect(!r.ok && r.problems[0]).toMatch(/looks like a format, not a scoring model/);
    const r2 = importFormatTemplate(text(scoring));
    expect(!r2.ok && r2.problems[0]).toMatch(/looks like a scoring model, not a format/);
  });

  it("refuses huge files", () => {
    const r = importScoringModel(" ".repeat(400 * 1024));
    expect(!r.ok && r.problems[0]).toMatch(/larger than 300 KB/);
  });

  it("json error helper works for the position-only wording too", () => {
    expect(describeJsonError("{\n\n x", new Error("Unexpected token x in JSON at position 4"))).toMatch(/line 3, column 2/);
  });
});

describe("imports become new organisation presets", () => {
  it("gets a new key, version 1 and remembers where it came from", () => {
    const { key, json } = asNewPreset(scoring as Record<string, unknown>, "Arrow – best 3", []);
    expect(key).toBe("arrow-best-3");
    expect(json).toMatchObject({ id: "arrow-best-3", name: "Arrow – best 3", version: 1, basedOn: expect.any(String) });
  });
  it("never reuses a key that is taken", () => {
    expect(asNewPreset({ id: "a" }, "Arrow", ["arrow", "arrow-2"]).key).toBe("arrow-3");
    expect(slugKey("!!!")).toBe("preset");
  });
});
