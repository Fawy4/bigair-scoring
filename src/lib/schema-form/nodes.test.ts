import { describe, expect, it } from "vitest";
import { FormatTemplateSchema } from "@/lib/schemas/format-template";
import { ScoringModelSchema } from "@/lib/schemas/scoring-model";
import { FORMAT_HIDDEN, FORMAT_LABELS, SCORING_HIDDEN, SCORING_LABELS } from "@/lib/ui-copy";
import { allNodes, defaultValueFor, friendlyMessage, humanise, schemaToNodes, type FieldNode } from "./nodes";

const scoring = schemaToNodes(ScoringModelSchema, SCORING_LABELS, SCORING_HIDDEN);
const format = schemaToNodes(FormatTemplateSchema, FORMAT_LABELS, FORMAT_HIDDEN);
const key = (n: FieldNode) => n.pattern.join(".");

describe("the Advanced form is generated from the schemas and covers every field", () => {
  it("every scoring-model field has a plain-language label (fails when the schema grows a field without one)", () => {
    const missing = allNodes(scoring).filter((n) => n.pattern.length > 0 && !(key(n) in SCORING_LABELS)).map(key);
    expect(missing).toEqual([]);
  });

  it("every format-template field has a plain-language label", () => {
    const missing = allNodes(format).filter((n) => n.pattern.length > 0 && !(key(n) in FORMAT_LABELS)).map(key);
    expect(missing).toEqual([]);
  });

  it("every field has a “?” help sentence and an example, so every setting can be explained on tap", () => {
    const check = (root: FieldNode, labels: typeof SCORING_LABELS) =>
      allNodes(root)
        .filter((n) => n.pattern.length > 0)
        .map(key)
        .filter((k) => !labels[k]?.help || !labels[k]?.example);
    expect(check(scoring, SCORING_LABELS)).toEqual([]);
    expect(check(format, FORMAT_LABELS)).toEqual([]);
  });

  it("optional sections (no default) get an on/off switch instead of empty fields", () => {
    const by = new Map<string, FieldNode>();
    for (const n of allNodes(format)) if (!by.has(key(n))) by.set(key(n), n);
    expect(by.get("flagOut")).toMatchObject({ kind: "nullable", absent: true });
    expect(by.get("rounds.*.crossHeat")).toMatchObject({ kind: "nullable", absent: true });
    const sb = new Map<string, FieldNode>();
    for (const n of allNodes(scoring)) if (!sb.has(key(n))) sb.set(key(n), n);
    expect(sb.get("heat.countedWeights")).toMatchObject({ kind: "nullable", absent: true });
    expect(sb.get("heat.counting.perCategoryMax")).toMatchObject({ kind: "nullable", absent: true });
    expect(sb.get("heat.impression")).toMatchObject({ kind: "nullable", absent: false }); // null is a real value here
    expect(sb.get("heightSensor")?.kind).toBe("object"); // has a default: always present
  });

  it("the labels do not describe fields that no longer exist", () => {
    const scoringKeys = new Set(allNodes(scoring).map(key));
    const stale = Object.keys(SCORING_LABELS).filter((k) => !k.includes("=") && !scoringKeys.has(k));
    expect(stale).toEqual([]);
    const formatKeys = new Set(allNodes(format).map(key));
    expect(Object.keys(FORMAT_LABELS).filter((k) => !k.includes("=") && !formatKeys.has(k))).toEqual([]);
  });

  it("the new dials are there: perCategoryMax and countedWeights", () => {
    const keys = allNodes(scoring).map(key);
    expect(keys).toContain("heat.counting.perCategoryMax");
    expect(keys).toContain("heat.countedWeights");
  });

  it("maps types to the right kind of field", () => {
    const by = new Map<string, FieldNode>();
    for (const n of allNodes(scoring)) if (!by.has(key(n))) by.set(key(n), n); // the outermost node wins
    expect(by.get("panel.aggregate")?.kind).toBe("enum");
    expect(by.get("panel.minJudges")).toMatchObject({ kind: "number", integer: true, min: 1 });
    expect(by.get("trick.criteria")?.kind).toBe("list");
    expect(by.get("heat.counting")?.kind).toBe("choice");
    expect(by.get("heat.impression")?.kind).toBe("nullable");
    expect(by.get("heat.total.maxRaw")?.kind).toBe("orConst");
    expect(by.get("heat.maxAttemptsPerRider")?.kind).toBe("nullable");
    expect(by.get("tieBreakers")?.kind).toBe("list");
    expect(by.get("heightSensor.mapping.toScore")?.kind).toBe("tuple");
    expect(by.get("modifiers.dns.total")).toMatchObject({ kind: "fixed", value: 0 });
    const counting = by.get("heat.counting");
    expect(counting?.kind === "choice" && counting.variants.map((v) => v.value)).toEqual(["best_n", "best_per_category", "single_best", "all", "none"]);
  });

  it("hides fields the system manages", () => {
    expect(scoring.kind === "object" && scoring.fields.map((f) => f.key)).not.toContain("id");
    expect(scoring.kind === "object" && scoring.fields.map((f) => f.key)).not.toContain("version");
  });

  it("format generators are offered as a choice with their parameters", () => {
    const gen = allNodes(format).find((n) => key(n) === "generator");
    expect(gen?.kind === "choice" && gen.variants.map((v) => v.value)).toEqual(["single_elimination", "dingle_elimination", "pools_to_final", "double_elimination", "qualifying_to_finals", "round_robin", "single_final"]);
    expect(allNodes(format).map(key)).toContain("generator.params.advancePerHeat");
  });

  it("a fixed template's rounds cover sources, durations, breaks and where each place goes", () => {
    const keys = allNodes(format).map(key);
    for (const k of ["rounds.*.heatSize", "rounds.*.durationMin", "rounds.*.breakAfterHeatMin", "rounds.*.entrantsFrom", "rounds.*.advance.*.places", "rounds.*.advance.*.to"]) {
      expect(keys).toContain(k);
    }
  });
});

describe("default values for new rows", () => {
  it("a new criterion gets a valid starting shape", () => {
    const list = allNodes(scoring).find((n) => key(n) === "trick.criteria") as Extract<FieldNode, { kind: "list" }>;
    const v = defaultValueFor(list.item) as Record<string, unknown>;
    expect(v).toMatchObject({ key: "", label: "", weight: 1, scale: { min: 0, max: 0, step: 1 } });
  });
  it("switching a nullable section on gives a filled section", () => {
    const imp = allNodes(scoring).find((n) => key(n) === "heat.impression") as Extract<FieldNode, { kind: "nullable" }>;
    expect(Object.keys(defaultValueFor(imp) as object).sort()).toEqual(["label", "scale", "weight"]);
  });
  it("a new counting rule starts with its discriminator", () => {
    const c = allNodes(scoring).find((n) => key(n) === "heat.counting") as Extract<FieldNode, { kind: "choice" }>;
    expect(defaultValueFor(c)).toMatchObject({ type: "best_n", n: 1 });
  });
});

describe("readable messages", () => {
  it("translates Zod's technical wording", () => {
    expect(friendlyMessage("Invalid input: expected number, received string")).toBe("Enter a number");
    expect(friendlyMessage("Too small: expected number to be >=1")).toBe("Must be at least 1");
    expect(friendlyMessage("criterion keys must be unique (duplicate: height)")).toBe("criterion keys must be unique (duplicate: height)");
  });
  it("humanises keys", () => {
    expect(humanise("maxPerCategory")).toBe("Max per category");
    expect(humanise("best_n")).toBe("Best n");
  });
});
