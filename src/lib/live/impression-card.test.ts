import { describe, expect, it } from "vitest";
import { cardSize, fitCard, impressionGrid } from "./impression-card";
import type { JudgeImpressions } from "./impression-status";

const status = (vals: Array<Array<number | "absent" | null>>): JudgeImpressions[] =>
  vals.map((col, j) => ({
    seatId: `s${j + 1}`,
    missing: col.filter((v) => v === null).length,
    cells: col.map((v, i) => ({ entryId: `e${i + 1}`, state: v === null ? "missing" : v === "absent" ? "absent" : "done", value: typeof v === "number" ? v : null })),
  }));
const words = { missing: "—", absent: "Absent" };

describe("the Impression card's grid", () => {
  it("one row per rider, one cell per judge, the panel mean, '—' where nothing was given and 'Absent' where marked", () => {
    const g = impressionGrid({ impressions: status([[7, 5], [7.5, null], [6.5, "absent"]]), riderOrder: ["e1", "e2"], tolerance: 1, words });
    expect(g.map((r) => r.cells.map((c) => c.label))).toEqual([["7.00", "7.50", "6.50"], ["5.00", "—", "Absent"]]);
    expect(g[0].panel).toBeCloseTo(7, 5);
    expect(g[0].panelLabel).toBe("7.00");
    expect(g[1].panelLabel).toBe("5.00");
  });
  it("a deliberately low score is coloured by its distance from the panel mean, like the trick scores", () => {
    const g = impressionGrid({ impressions: status([[7], [7], [7], [2]]), riderOrder: ["e1"], tolerance: 1, words });
    const bands = g[0].cells.map((c) => c.tone?.band);
    expect(bands.slice(0, 3)).toEqual([1, 1, 1]); // the others sit 1.25 from a mean pulled down by the low one
    expect(bands[3]).toBe(3);
    expect(g[0].cells[3].tone?.delta).toBe("−3.8");
  });
  it("no colour with a single score (nothing to be far from)", () => {
    const g = impressionGrid({ impressions: status([[7], [null]]), riderOrder: ["e1"], tolerance: 1, words });
    expect(g[0].cells[0].tone).toBeNull();
  });
});

describe("fitting the card beside the rider cards", () => {
  it("fits at the normal size when there is room, then tighter spacing, then smaller digits, then a button", () => {
    const need = (l: 0 | 1 | 2) => cardSize(l, 3, 3);
    expect(fitCard({ availW: need(0).w, availH: need(0).h, riders: 3, judges: 3 })).toBe(0);
    expect(fitCard({ availW: need(0).w - 1, availH: need(0).h, riders: 3, judges: 3 })).toBe(1);
    expect(fitCard({ availW: need(1).w - 1, availH: need(1).h, riders: 3, judges: 3 })).toBe(2);
    expect(fitCard({ availW: need(2).w - 1, availH: need(2).h, riders: 3, judges: 3 })).toBe("button");
  });
  it("height counts too: many riders in a short row become the button", () => {
    expect(fitCard({ availW: 900, availH: 90, riders: 5, judges: 3 })).toBe("button");
    expect(fitCard({ availW: 900, availH: 90, riders: 1, judges: 3 })).not.toBe("button");
  });
  it("a narrow window is the button", () => {
    expect(fitCard({ availW: 120, availH: 200, riders: 2, judges: 3 })).toBe("button");
  });
});
