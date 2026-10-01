import { describe, expect, it } from "vitest";
import { insertRerunItem, rerunName } from "./rerun";
import type { SchedulePlan } from "@/lib/schemas/schedule";

// docs/08 §1H-10
describe("1H-10 rerunName", () => {
  it("Heat 3 → R, 'Heat 3 re-run'", () => expect(rerunName({ number: 3, suffix: null, name: null })).toEqual({ suffix: "R", name: "Heat 3 re-run" }));
  it("a renamed heat keeps its name", () => expect(rerunName({ number: 5, suffix: null, name: "Semi-final 1" })).toEqual({ suffix: "R", name: "Semi-final 1 re-run" }));
  it("re-running a re-run → R2, 'Heat 3 re-run 2'", () => expect(rerunName({ number: 3, suffix: "R", name: "Heat 3 re-run" })).toEqual({ suffix: "R2", name: "Heat 3 re-run 2" }));
  it("a third time → R3", () => expect(rerunName({ number: 3, suffix: "R2", name: "Heat 3 re-run 2" })).toEqual({ suffix: "R3", name: "Heat 3 re-run 3" }));
});

const item = (heatId: string, extra: Record<string, unknown> = {}) => ({ id: `i-${heatId}`, kind: "heat" as const, heatId, ...extra });
const plan = (items: unknown[]): SchedulePlan => ({ id: "p", name: "Main", active: true, items, anchors: {}, actualStarts: {} }) as unknown as SchedulePlan;
const ids = (p: SchedulePlan) => p.items.map((i) => (i as { heatId?: string }).heatId ?? "-");

describe("1H-10 insertRerunItem", () => {
  const base = plan([item("H1"), item("H2"), item("H3"), item("H4"), item("H5")]);
  it("H3 running and re-run → right after H3", () => expect(ids(insertRerunItem(base, "H3", "H3R", "H3"))).toEqual(["H1", "H2", "H3", "H3R", "H4", "H5"]));
  it("H3 under review while H4 runs → after H4", () => expect(ids(insertRerunItem(base, "H3", "H3R", "H4"))).toEqual(["H1", "H2", "H3", "H4", "H3R", "H5"]));
  it("nothing running → right after H3", () => expect(ids(insertRerunItem(base, "H3", "H3R", null))).toEqual(["H1", "H2", "H3", "H3R", "H4", "H5"]));
  it("keeps pins, breaks and notes", () => {
    const p = { ...plan([item("H1"), { id: "b1", kind: "break", label: "Lunch", durationMin: 20 }, item("H3", { warmUpMin: 5 }), item("H4")]), anchors: { "i-H4": "11:00" } } as unknown as SchedulePlan;
    const out = insertRerunItem(p, "H3", "H3R", "H3");
    expect(out.items).toHaveLength(5);
    expect(out.items[1]).toEqual({ id: "b1", kind: "break", label: "Lunch", durationMin: 20 });
    expect(out.items[2]).toEqual(item("H3", { warmUpMin: 5 }));
    expect(out.items[4]).toEqual(item("H4"));
    expect(out.anchors).toEqual({ "i-H4": "11:00" });
  });
  it("the new item copies the original's own lengths but no pin", () => {
    const p = { ...plan([item("H3", { warmUpMin: 5, durationMin: 12 })]), anchors: { "i-H3": "10:34" } } as unknown as SchedulePlan;
    const out = insertRerunItem(p, "H3", "H3R", "H3");
    expect(out.items[1]).toMatchObject({ kind: "heat", heatId: "H3R", warmUpMin: 5, durationMin: 12 });
    expect(out.anchors).toEqual({ "i-H3": "10:34" });
  });
  it("adds exactly one item and does not change the input", () => {
    const before = JSON.stringify(base);
    const out = insertRerunItem(base, "H3", "H3R", "H3");
    expect(out.items.length).toBe(base.items.length + 1);
    expect(JSON.stringify(base)).toBe(before);
  });
  it("a heat that is not on the run order: appended at the end", () => {
    expect(ids(insertRerunItem(plan([item("H1"), item("H2")]), "HX", "HXR", null))).toEqual(["H1", "H2", "HXR"]);
  });
});
