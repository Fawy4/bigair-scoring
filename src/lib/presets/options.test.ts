import { describe, expect, it } from "vitest";
import { presetGroups, takenKeys, type PresetRow } from "./options";

const row = (id: string, key: string, name: string, version: number, org: string | null): PresetRow => ({ id, key, name, version, organisation_id: org, json: {} });
const rows = [row("s1", "kota", "KOTA", 1, null), row("s2", "gka", "GKA", 1, null), row("o1", "mine", "Arrow best 3", 1, "org"), row("o2", "mine", "Arrow best 3", 2, "org"), row("o3", "mine", "Arrow best 3", 3, "org")];

describe("preset dropdown", () => {
  it("shows built-in presets and the latest version of each of the organisation's own", () => {
    const g = presetGroups(rows, null);
    expect(g.system.map((o) => o.label)).toEqual(["GKA", "KOTA"]);
    expect(g.organisation).toEqual([{ id: "o3", label: "Arrow best 3 (v3)", key: "mine", own: true }]);
  });
  it("keeps the older version a division already uses, labelled", () => {
    const g = presetGroups(rows, "o1");
    expect(g.organisation.map((o) => o.label)).toEqual(["Arrow best 3 (v3)", "Arrow best 3 (v1)"]);
  });
  it("a first version has no suffix", () => {
    expect(presetGroups([row("o1", "mine", "Arrow", 1, "org")], null).organisation[0].label).toBe("Arrow");
  });
  it("collects taken keys once", () => {
    expect(takenKeys(rows).sort()).toEqual(["gka", "kota", "mine"]);
  });
});
