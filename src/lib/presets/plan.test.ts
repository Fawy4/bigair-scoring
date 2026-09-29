import { describe, expect, it } from "vitest";
import { canonicalHash, planPreset } from "./plan";

describe("canonicalHash", () => {
  it("does not care about key order", () => {
    expect(canonicalHash({ a: 1, b: { c: [1, 2], d: "x" } })).toBe(canonicalHash({ b: { d: "x", c: [1, 2] }, a: 1 }));
  });
  it("changes when a value changes", () => {
    expect(canonicalHash({ a: 1 })).not.toBe(canonicalHash({ a: 2 }));
    expect(canonicalHash({ a: [1, 2] })).not.toBe(canonicalHash({ a: [2, 1] })); // array order matters
  });
});

describe("planPreset (how a preset file meets the database)", () => {
  const file = { key: "kota", version: 1, hash: "h1" };
  it("inserts a preset the database has never seen", () => {
    expect(planPreset(file, [], true)).toEqual({ action: "insert", version: 1 });
  });
  it("leaves an identical preset alone (running the seed twice changes nothing)", () => {
    expect(planPreset(file, [{ version: 1, hash: "h1" }], true)).toEqual({ action: "unchanged" });
  });
  it("refuses to edit a versioned preset in place: divisions may already use it", () => {
    const plan = planPreset({ ...file, hash: "h2" }, [{ version: 1, hash: "h1" }], true);
    expect(plan.action).toBe("error");
    expect((plan as { message: string }).message).toMatch(/bump.*version/i);
  });
  it("adds a new row when the version was bumped, keeping the old one for divisions that use it", () => {
    expect(planPreset({ ...file, version: 2, hash: "h2" }, [{ version: 1, hash: "h1" }], true)).toEqual({ action: "insert", version: 2 });
  });
  it("refuses to go back to an older version", () => {
    expect(planPreset({ ...file, version: 1 }, [{ version: 2, hash: "h9" }], true).action).toBe("error");
  });
  it("presets without a version field get the next version automatically when their content changes", () => {
    const f = { key: "dingle", version: undefined, hash: "h2" };
    expect(planPreset(f, [{ version: 1, hash: "h1" }], false)).toEqual({ action: "insert", version: 2 });
    expect(planPreset({ ...f, hash: "h1" }, [{ version: 1, hash: "h1" }], false)).toEqual({ action: "unchanged" });
    expect(planPreset(f, [{ version: 1, hash: "h0" }, { version: 2, hash: "h2" }], false)).toEqual({ action: "unchanged" });
  });
});
