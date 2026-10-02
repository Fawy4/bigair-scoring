import { describe, expect, it } from "vitest";
import { orderRows, readTableOrder, writeTableOrder } from "./matrix-order";

// Console v2 §2: the score table is chronological with the newest on top; a toggle groups it by rider.
const logged = [
  { id: "a1", riderKey: "red" },
  { id: "b1", riderKey: "blue" },
  { id: "a2", riderKey: "red" },
  { id: "c1", riderKey: "green" },
  { id: "b2", riderKey: "blue" },
];
const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id);

describe("score table order", () => {
  it("newest on top: the attempt logged last is the first row", () => {
    expect(ids(orderRows(logged, "newest", ["red", "blue", "green"]))).toEqual(["b2", "c1", "a2", "b1", "a1"]);
  });
  it("grouped by rider: riders in the order of the heat's seats, newest first inside each", () => {
    expect(ids(orderRows(logged, "rider", ["red", "blue", "green"]))).toEqual(["a2", "a1", "b2", "b1", "c1"]);
    expect(ids(orderRows(logged, "rider", ["green", "red", "blue"]))).toEqual(["c1", "a2", "a1", "b2", "b1"]);
  });
  it("a rider who is not in the heat's seats any more goes last; nothing is lost and the input is not changed", () => {
    const before = JSON.stringify(logged);
    const out = orderRows(logged, "rider", ["blue"]);
    expect(ids(out)).toEqual(["b2", "b1", "c1", "a2", "a1"]); // blue first, then the others as logged, newest on top
    expect(out[0].riderKey).toBe("blue");
    expect(out).toHaveLength(5);
    expect(JSON.stringify(logged)).toBe(before);
  });
  it("an empty table stays empty", () => {
    expect(orderRows([], "newest", [])).toEqual([]);
  });
  it("the choice is remembered on the device, and blocked storage means the default (newest on top)", () => {
    const data: Record<string, string> = {};
    const store = { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
    expect(readTableOrder(store)).toBe("newest");
    writeTableOrder(store, "rider");
    expect(readTableOrder(store)).toBe("rider");
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readTableOrder(broken)).toBe("newest");
    expect(() => writeTableOrder(broken, "rider")).not.toThrow();
    expect(readTableOrder(null)).toBe("newest");
  });
});
