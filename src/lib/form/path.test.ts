import { describe, expect, it } from "vitest";
import { getIn, issuesToMap, moveIn, removeIn, setIn } from "./path";

describe("form path helpers", () => {
  const obj = { a: { b: [1, 2, 3] }, c: "x" };

  it("reads nested values and returns undefined for missing ones", () => {
    expect(getIn(obj, ["a", "b", 1])).toBe(2);
    expect(getIn(obj, ["a", "z", 1])).toBeUndefined();
  });

  it("sets without touching the original", () => {
    const next = setIn(obj, ["a", "b", 1], 9);
    expect(next.a.b).toEqual([1, 9, 3]);
    expect(obj.a.b).toEqual([1, 2, 3]);
    expect(next.c).toBe("x");
  });

  it("creates missing containers (numbers make arrays)", () => {
    expect(setIn({}, ["x", 0, "y"], 1)).toEqual({ x: [{ y: 1 }] });
  });

  it("removes array elements and object keys", () => {
    expect(removeIn(obj, ["a", "b", 0]).a.b).toEqual([2, 3]);
    expect(removeIn(obj, ["c"])).toEqual({ a: { b: [1, 2, 3] } });
  });

  it("moves array elements up and down, ignoring impossible moves", () => {
    expect(moveIn(obj, ["a", "b"], 2, 0).a.b).toEqual([3, 1, 2]);
    expect(moveIn(obj, ["a", "b"], 0, 5)).toBe(obj);
  });

  it("turns Zod issues into a field map (first message wins)", () => {
    expect(issuesToMap([{ path: ["settings", "readyCallMin"], message: "too big" }, { path: ["settings", "readyCallMin"], message: "second" }, { path: ["name"], message: "needed" }])).toEqual({
      "settings.readyCallMin": "too big",
      name: "needed",
    });
  });
});
