import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canPublish, defaultVersion, MASTER_KINDS, nextVersion, prepareNewVersion, validateMasterPreset, type MasterRow } from "./master-presets";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const row = (over: Partial<MasterRow>): MasterRow => ({ id: "x", key: "k", name: "K", version: 1, published_at: "2026-01-01T00:00:00Z", ...over });

describe("master presets: which version customers get", () => {
  const rows = [row({ id: "a", version: 1 }), row({ id: "b", version: 2 }), row({ id: "c", version: 3, published_at: null })];
  it("the default for new divisions is the highest PUBLISHED version; drafts are ignored", () => {
    expect(defaultVersion(rows)?.id).toBe("b");
  });
  it("editing always creates the next number after every version, drafts included", () => {
    expect(nextVersion(rows)).toBe(4);
    expect(nextVersion([])).toBe(1);
  });
  it("only a draft newer than the current default can be published", () => {
    expect(canPublish(rows, "c")).toEqual({ ok: true });
    expect(canPublish(rows, "b")).toMatchObject({ ok: false });
    expect(canPublish(rows, "a")).toMatchObject({ ok: false });
    expect(canPublish([...rows, row({ id: "d", version: 4, published_at: "2026-02-01T00:00:00Z" })], "c")).toMatchObject({ ok: false });
    expect(canPublish(rows, "nope")).toMatchObject({ ok: false });
  });
  it("with nothing published yet, any draft can be published", () => {
    expect(canPublish([row({ id: "z", version: 1, published_at: null })], "z")).toEqual({ ok: true });
  });
});

describe("master presets: validating an edit", () => {
  it("offers the four kinds the owner asked for", () => {
    expect(MASTER_KINDS.map((k) => k.kind)).toEqual(["scoring_model", "format_template", "trick_vocabulary", "identification"]);
  });
  it("accepts the shipped presets of every kind", () => {
    expect(validateMasterPreset("scoring_model", read("presets/scoring/kota-best3-impression.json")).ok).toBe(true);
    expect(validateMasterPreset("format_template", read("presets/formats/single-final.json")).ok).toBe(true);
    expect(validateMasterPreset("trick_vocabulary", read("presets/tricks/big-air-vocabulary.json")).ok).toBe(true);
    const ident = read("presets/identification/schemes.json");
    expect(validateMasterPreset("identification", { ...ident.schemes[0], palette: ident.palette }).ok).toBe(true);
  });
  it("refuses a scoring model that breaks its schema, in plain words, without throwing", () => {
    const r = validateMasterPreset("scoring_model", { id: "x", name: "Broken" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message.length).toBeGreaterThan(5);
  });
  it("refuses a vocabulary without its required parts", () => {
    const r = validateMasterPreset("trick_vocabulary", { baseTricks: [] });
    expect(r.ok).toBe(false);
  });
  it("prepareNewVersion pins the key, and stamps the new version number on scoring models", () => {
    const original = read("presets/scoring/kota-best3-impression.json");
    const r = prepareNewVersion("scoring_model", { ...original, id: "something-else", name: "Renamed" }, { key: original.id, version: 5 });
    expect(r.id).toBe(original.id);
    expect(r.version).toBe(5);
    expect(r.name).toBe("Renamed");
  });
  it("prepareNewVersion keeps other kinds' shape and only pins the key", () => {
    const f = read("presets/formats/single-final.json");
    const r = prepareNewVersion("format_template", { ...f, id: "zzz" }, { key: f.id, version: 3 });
    expect(r.id).toBe(f.id);
  });
});
