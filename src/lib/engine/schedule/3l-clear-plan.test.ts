// Polish 3, item 5: "Clear this plan" returns every heat that has not started to "Heats not in the run order". Breaks and notes go; hand-set pins go with their heats;
// a heat that has started, ended or been published stays where it ran (and a break that already happened); the plan itself remains.
import { describe, expect, it } from "vitest";
import type { SchedulePlan } from "@/lib/schemas/schedule";
import { clearPlan, unscheduledHeats, type HeatInfo } from "./run-order";

const ids = Array.from({ length: 8 }, (_, i) => `H${i + 1}`);
const plan = (extra: Partial<SchedulePlan> = {}): SchedulePlan => ({
  id: "p",
  name: "Saturday",
  active: true,
  anchors: { "i-H1": "10:00", "i-H5": "13:30", b1: "12:00" },
  actualStarts: {},
  items: [
    ...ids.slice(0, 4).map((id) => ({ id: `i-${id}`, kind: "heat" as const, heatId: id })),
    { id: "b1", kind: "break" as const, label: "Lunch", durationMin: 30 },
    ...ids.slice(4).map((id) => ({ id: `i-${id}`, kind: "heat" as const, heatId: id })),
    { id: "n1", kind: "note" as const, label: "Wind call 16:00" },
  ],
  ...extra,
});
const info = (heatId: string, n: number): HeatInfo => ({ heatId, division: "Pro Men", round: "R1", roundOrder: 1, heat: `Heat ${n}`, number: n, durationMin: 10, warmUpMin: 0 });
const infos = ids.map((id, i) => info(id, i + 1));

describe("Clear this plan", () => {
  it("a plan with 8 heats: all 8 go to 'not in the run order', the plan is empty, breaks, notes and pins are gone", () => {
    const r = clearPlan(plan(), new Set());
    expect(r.plan.items).toEqual([]);
    expect(r.plan.anchors).toEqual({});
    expect(r.plan.actualStarts).toEqual({});
    expect(r.plan.id).toBe("p");
    expect(r.plan.name).toBe("Saturday");
    expect(r.heatsRemoved).toBe(8);
    expect(r.otherRemoved).toBe(2); // the lunch break and the note
    expect(r.heatsStay).toBe(0);
    const groups = unscheduledHeats(infos, r.plan);
    expect(groups.flatMap((g) => g.heats).map((h) => h.heatId)).toEqual(ids);
  });

  it("a plan with 2 heats already run: those 2 stay, in their order, with their pins; the other 6 go", () => {
    const r = clearPlan(plan(), new Set(["H1", "H2"]));
    expect(r.plan.items.map((i) => i.id)).toEqual(["i-H1", "i-H2"]);
    expect(r.plan.anchors).toEqual({ "i-H1": "10:00" });
    expect(r.heatsRemoved).toBe(6);
    expect(r.heatsStay).toBe(2);
    expect(unscheduledHeats(infos, r.plan).flatMap((g) => g.heats).map((h) => h.heatId)).toEqual(ids.slice(2));
  });

  it("a break that already started stays, with its actual start", () => {
    const r = clearPlan(plan({ actualStarts: { b1: "2026-10-10T09:00:00Z" } }), new Set(["H1", "H2"]));
    expect(r.plan.items.map((i) => i.id)).toEqual(["i-H1", "i-H2", "b1"]);
    expect(r.plan.actualStarts).toEqual({ b1: "2026-10-10T09:00:00Z" });
    expect(r.otherRemoved).toBe(1); // only the note
  });

  it("a plan that is already empty stays empty; the hold is left as it was", () => {
    const empty = plan({ items: [], anchors: {}, hold: { since: "2026-10-10T08:00:00Z" } });
    const r = clearPlan(empty, new Set());
    expect(r.plan).toEqual(empty);
    expect(r.heatsRemoved + r.otherRemoved + r.heatsStay).toBe(0);
  });

  it("the confirmation sentence counts what stays", () => {
    expect(clearPlan(plan(), new Set(["H1", "H2", "H3"])).heatsStay).toBe(3);
  });
});
