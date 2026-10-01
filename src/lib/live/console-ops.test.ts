import { describe, expect, it } from "vitest";
import { headConsole } from "./design-fixtures";
import { blockersFor, canMerge, mergeKeepFirst, riderTotal, withCellScore, withRowState } from "./console-ops";

// The laptop console (owner, round 3): editing a score, deleting an attempt, a rider's status and Publish all have to work on the real maths.
const c = () => headConsole();
const imp = { red: [7.5, 7.0, 8.0], blue: [6.0, null, 6.0] } as Record<string, Array<number | null>>;

describe("rider totals, with the docs/08 values", () => {
  it("Red: tricks 24.04 + impression 7.50 = 31.54 (§1A)", () => {
    expect(riderTotal(c().rows.filter((r) => r.riderKey === "red"), imp.red, null)).toMatchObject({ tricks: 24.04, impression: 7.5, total: 31.54, label: "31.54" });
  });
  it("Interference drops the best trick: 30.58 (§1A-ii)", () => {
    expect(riderTotal(c().rows.filter((r) => r.riderKey === "red"), imp.red, "INT")).toMatchObject({ total: 30.58 });
  });
  it("DNS and DSQ have no total", () => {
    for (const s of ["DNS", "DSQ"] as const) expect(riderTotal(c().rows.filter((r) => r.riderKey === "red"), imp.red, s)).toMatchObject({ total: null, label: "—" });
  });
  it("DNF keeps the scores", () => {
    expect(riderTotal(c().rows.filter((r) => r.riderKey === "red"), imp.red, "DNF").label).toBe("31.54");
  });
  it("a deleted or duplicate attempt does not count", () => {
    const red = c().rows.filter((r) => r.riderKey === "red");
    const dup = red.find((r) => r.state === "duplicate")!;
    expect(dup.panel).toBe(8.25);
    const without = riderTotal(red.map((r) => (r.id === "red-2" ? withRowState(r, "deleted") : r)), imp.red, null);
    expect(without.tricks).toBe(23.08); // 8.08 + 7.71 + 7.29: attempt 2 is gone and the duplicate never counted
  });
  it("Blue's Impression score is the mean of the judges who gave one (6.0 and 6.0)", () => {
    expect(riderTotal(c().rows.filter((r) => r.riderKey === "blue"), imp.blue, null)).toMatchObject({ impression: 6, tricks: 13.5, total: 19.5 });
  });
});

describe("editing a score", () => {
  it("J3 on attempt 3 from 7.25 to 8.0 changes the panel score from 7.29 to 7.54 (mean of 7.25, 7.375, 8.0)", () => {
    const row = c().rows.find((r) => r.id === "red-3")!;
    expect(row.panelLabel).toBe("7.29");
    const next = withCellScore(row, "J3", 8.0);
    expect(next.cells[2]).toMatchObject({ state: "scored", value: 8, label: "8.00" });
    expect(next.panelLabel).toBe("7.54");
  });
  it("giving a missing score completes the row: Blue attempt 2, J3 6.5 → panel 6.50, no longer incomplete", () => {
    const row = c().rows.find((r) => r.id === "blue-2")!;
    expect(row.panelState).toBe("incomplete");
    const next = withCellScore(row, "J3", 6.5);
    expect(next.panelLabel).toBe("6.50");
    expect(next.panelState).not.toBe("incomplete");
  });
  it("a far-off score is flagged as an outlier on the right cell (Red attempt 5, J3 gives 4.0)", () => {
    const row = c().rows.find((r) => r.id === "red-5")!;
    const next = withCellScore(row, "J3", 4.0);
    expect(next.panelState).toBe("outlier");
    expect(next.cells[2].state).toBe("outlier");
  });
});

describe("what blocks Publish", () => {
  it("Blue: Judge 3 has no score for attempt 2, and Judge 2 has no Impression score", () => {
    const k = c();
    const b = blockersFor(k.rows, imp, { red: null, blue: null }, k.labels);
    expect(b).toEqual(["Judge 3 has no score for BLUE, attempt 2", "Judge 2 has no Impression score for BLUE"]);
  });
  it("giving both clears the list", () => {
    const k = c();
    const rows = k.rows.map((r) => (r.id === "blue-2" ? withCellScore(r, "J3", 6.5) : r));
    expect(blockersFor(rows, { ...imp, blue: [6, 6.5, 6] }, { red: null, blue: null }, k.labels)).toEqual([]);
  });
  it("a rider who did not start blocks nothing", () => {
    const k = c();
    expect(blockersFor(k.rows, imp, { red: null, blue: "DNS" }, k.labels)).toEqual([]);
  });
});

describe("selecting several attempts (tick boxes)", () => {
  it("Merge is on when the selection is two or more attempts of the same rider and trick (a possible duplicate)", () => {
    const rows = c().rows;
    expect(canMerge([rows.find((r) => r.id === "red-2")!, rows.find((r) => r.id === "red-6")!])).toBe(true);
  });
  it("Merge is off for one attempt, for different tricks and for different riders", () => {
    const rows = c().rows;
    const get = (id: string) => rows.find((r) => r.id === id)!;
    expect(canMerge([get("red-2")])).toBe(false);
    expect(canMerge([get("red-2"), get("red-3")])).toBe(false);
    expect(canMerge([get("red-2"), get("blue-1")])).toBe(false);
    expect(canMerge([])).toBe(false);
  });
  it("merging keeps the first logged attempt and removes the others", () => {
    const rows = c().rows;
    const sel = [rows.find((r) => r.id === "red-6")!, rows.find((r) => r.id === "red-2")!];
    const out = mergeKeepFirst(rows, sel.map((r) => r.id));
    expect(out.find((r) => r.id === "red-2")?.state).toBe("ok");
    expect(out.find((r) => r.id === "red-6")?.state).toBe("deleted");
  });
});
