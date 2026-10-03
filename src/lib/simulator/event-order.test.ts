import { describe, expect, it } from "vitest";
import { eventOrder } from "./event-order";

// Polish 2, item 7: "Run the whole event" plays every day's active run order in day order, then any heat no plan lists (runOrder adds those).
const plan = (day: string, heats: string[], o: { active?: boolean; hold?: boolean } = {}) => ({ day, active: o.active ?? true, hold: o.hold ?? false, items: heats.map((h, i) => ({ id: `i${i}`, kind: "heat", heatId: h })) });

describe("the whole event's order", () => {
  it("Saturday's active plan, then Sunday's; an inactive Plan B and breaks are left out", () => {
    const o = eventOrder([plan("2026-10-09", ["F1", "F2"]), plan("2026-10-08", ["Q1", "Q2", "Q3"]), plan("2026-10-08", ["X9"], { active: false }), { day: "2026-10-09", active: true, hold: false, items: [{ id: "b", kind: "break" }] }]);
    expect(o.heatIds).toEqual(["Q1", "Q2", "Q3", "F1", "F2"]);
    expect([...o.held]).toEqual([]);
  });
  it("a plan on hold holds its own heats only", () => {
    const o = eventOrder([plan("2026-10-08", ["Q1"]), plan("2026-10-09", ["F1"], { hold: true })]);
    expect([...o.held]).toEqual(["F1"]);
  });
  it("no plan at all: no order (the default order of divisions, rounds and heats is used)", () => {
    expect(eventOrder([])).toEqual({ heatIds: null, held: new Set() });
  });
});
