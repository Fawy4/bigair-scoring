import { describe, expect, it } from "vitest";
import { presetGroups, type PresetRow } from "./options";
import { canHideBuiltIn, canRetire, inUseBy, nameAfterRename, nextVersionOf, type DivisionUse } from "./manage";

const row = (id: string, key: string, name: string, version: number, org: string | null, extra: Partial<PresetRow> = {}): PresetRow => ({ id, key, name, version, organisation_id: org, json: { name, v: version }, ...extra });

describe("in-use check (delete is refused while a live division uses the preset)", () => {
  const rows = [row("o1", "mine", "Mine", 1, "org"), row("o2", "mine", "Mine", 2, "org"), row("o3", "other", "Other", 1, "org")];
  const use = (division: string, event: string, scoring: string | null, archived = false, format: string | null = null): DivisionUse => ({ divisionName: division, eventName: event, eventArchived: archived, scoringModelId: scoring, formatTemplateId: format });

  it("names the division and the event, whichever version of the preset it uses", () => {
    expect(inUseBy("scoring_model", ["o1", "o2"], [use("Pro Men", "Arrow Big Air", "o1")])).toEqual(["Pro Men in Arrow Big Air"]);
    expect(inUseBy("scoring_model", ["o1", "o2"], [use("Pro Men", "Arrow Big Air", "o2")])).toEqual(["Pro Men in Arrow Big Air"]);
  });
  it("a division of an archived event does not block", () => {
    expect(inUseBy("scoring_model", ["o1"], [use("Pro Men", "Old event", "o1", true)])).toEqual([]);
  });
  it("another preset, or the other kind, does not count", () => {
    expect(inUseBy("scoring_model", ["o1"], [use("Pro Men", "Arrow", "o3")])).toEqual([]);
    expect(inUseBy("scoring_model", ["o1"], [use("Pro Men", "Arrow", null, false, "o1")])).toEqual([]);
    expect(inUseBy("format_template", ["o1"], [use("Pro Men", "Arrow", null, false, "o1")])).toEqual(["Pro Men in Arrow"]);
  });
  it("lists each division once, in the order given", () => {
    const d = [use("A", "E", "o1"), use("A", "E", "o2"), use("B", "E", "o1")];
    expect(inUseBy("scoring_model", ["o1", "o2"], d)).toEqual(["A in E", "B in E"]);
  });
});

describe("copy on load: a later change to a preset never alters what a division already loaded", () => {
  const v1 = row("o1", "mine", "Mine", 1, "org", { json: { name: "Mine", counted: 3 } });
  it("updating from a division adds a NEW row; the old row is untouched", () => {
    const { row: next, rows } = nextVersionOf([v1], "mine", { name: "Mine", counted: 2 }, "new-id");
    expect(next.version).toBe(2);
    expect(rows.find((r) => r.id === "o1")!.json).toEqual({ name: "Mine", counted: 3 });
    expect(next.json).toEqual({ name: "Mine", counted: 2, id: "mine", version: 2 });
  });
  it("renaming changes the name of every version and nothing else in the rules", () => {
    const rows = [v1, row("o2", "mine", "Mine", 2, "org", { json: { name: "Mine", counted: 2 } })];
    const renamed = rows.map((r) => ({ ...r, name: nameAfterRename("New name"), json: { ...(r.json as object), name: "New name" } }));
    expect(renamed.map((r) => (r.json as unknown as { counted: number }).counted)).toEqual([3, 2]);
    expect(renamed.every((r) => r.name === "New name")).toBe(true);
  });
  it("a trimmed name is what gets stored", () => {
    expect(nameAfterRename("  Spaces  ")).toBe("Spaces");
  });
});

describe("Load… menu: hidden, retired and DEFAULT built-ins", () => {
  const rows = [row("s1", "kota", "KOTA", 1, null), row("s2", "gka", "GKA", 1, null), row("s3", "old", "Old one", 1, null, { retired_at: "2026-10-01" }), row("o1", "mine", "Mine", 1, "org")];
  it("retired built-ins are in nobody's menu", () => {
    expect(presetGroups(rows, null).system.map((o) => o.label)).toEqual(["GKA", "KOTA"]);
  });
  it("a division that already uses a retired built-in still sees it", () => {
    expect(presetGroups(rows, "s3").system.map((o) => o.label)).toEqual(["GKA", "KOTA", "Old one"]);
  });
  it("hidden built-ins vanish from the menu; Show hidden brings them back, marked", () => {
    const hide = { hiddenKeys: ["kota"], defaultKey: "gka" };
    expect(presetGroups(rows, null, hide).system.map((o) => o.label)).toEqual(["GKA"]);
    expect(presetGroups(rows, null, hide).hiddenCount).toBe(1);
    const shown = presetGroups(rows, null, { ...hide, showHidden: true }).system;
    expect(shown.map((o) => [o.label, o.hidden === true])).toEqual([["GKA", false], ["KOTA", true]]);
  });
  it("the DEFAULT built-in is never hidden, even if a stale row says so", () => {
    expect(presetGroups(rows, null, { hiddenKeys: ["gka"], defaultKey: "gka" }).system.map((o) => o.label)).toEqual(["GKA", "KOTA"]);
    expect(canHideBuiltIn("gka", "gka")).toBe(false);
    expect(canHideBuiltIn("kota", "gka")).toBe(true);
  });
  it("hiding does not touch the organisation's own presets, and own entries know they are own", () => {
    const g = presetGroups(rows, null, { hiddenKeys: ["mine"], defaultKey: null });
    expect(g.organisation.map((o) => [o.label, o.own])).toEqual([["Mine", true]]);
  });
  it("the owner cannot retire the DEFAULT", () => {
    expect(canRetire("gka", "gka")).toBe(false);
    expect(canRetire("kota", "gka")).toBe(true);
  });
});
