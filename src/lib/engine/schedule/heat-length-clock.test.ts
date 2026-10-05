// Fix (fix-heat-length): the heat clock runs the run order's length, not the draw's copy. The rule the database applies (plan_length_sec / sync_heat_length) in pure form:
// a heat with a row that has a length of its own runs that length; a heat in no plan, or whose row has none, runs its own copy. The run order's displayed length and the clock agree.
import { describe, expect, it } from "vitest";
import type { SchedulePlan } from "@/lib/schemas/schedule";
import { clockLengthSec } from "./run-order";
import { computeTimetable } from "./timetable";
import { DAY, TZ } from "./fixtures";
import type { HeatLive } from "./types";

const plan = (items: SchedulePlan["items"]): SchedulePlan => ({ id: "p", name: "A", active: true, anchors: { r1: "10:00" }, actualStarts: {}, items });
const heat = (id: string): HeatLive => ({ heatId: id, division: "Pro", round: "R1", heat: `Heat ${id}`, durationMin: 10, warmUpMin: 0, breakAfterHeatMin: 2, breakAfterRoundMin: 2 });

describe("clockLengthSec", () => {
  it("a planned heat with its own length: the run order's length, to the second", () => {
    expect(clockLengthSec(plan([{ id: "r1", kind: "heat", heatId: "A", durationMin: 6 }]), "A", 600)).toBe(360);
    expect(clockLengthSec(plan([{ id: "r1", kind: "heat", heatId: "A", durationMin: 7.5 }]), "A", 600)).toBe(450);
  });

  it("a heat in no plan, with no plan at all, or whose row has no length: the heat's own copy", () => {
    expect(clockLengthSec(plan([{ id: "r1", kind: "heat", heatId: "B", durationMin: 6 }]), "A", 540)).toBe(540);
    expect(clockLengthSec(null, "A", 540)).toBe(540);
    expect(clockLengthSec(undefined, "A", 540)).toBe(540);
    expect(clockLengthSec(plan([{ id: "r1", kind: "heat", heatId: "A" }]), "A", 540)).toBe(540);
  });

  it("a break row with the same id never answers for a heat", () => {
    expect(clockLengthSec(plan([{ id: "b1", kind: "break", label: "Lunch", durationMin: 30 }]), "b1", 600)).toBe(600);
  });

  it("is the length the run order itself shows for the row (display and clock cannot differ)", () => {
    const p = plan([{ id: "r1", kind: "heat", heatId: "A", durationMin: 6 }, { id: "r2", kind: "heat", heatId: "B" }]);
    const t = computeTimetable(p, [heat("A"), heat("B")], { timezone: TZ, eventDay: DAY, defaults: { breakAfterHeatMin: 2, breakAfterRoundMin: 2, readyCallMin: 15 } });
    for (const [row, id] of [[t.rows[0], "A"], [t.rows[1], "B"]] as const) expect(clockLengthSec(p, id, 600) / 60).toBe(row.durationMin);
  });
});
