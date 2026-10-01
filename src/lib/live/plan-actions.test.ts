// docs/08 §1G-11: Hold, Resume at and Shift on server time (values from §3E). §1G-13: the next heat.
import { describe, expect, it } from "vitest";
import { computeTimetable } from "@/lib/engine/schedule";
import { at, day, idOf, opts, patch, plan, row, TZ, withActuals } from "@/lib/engine/schedule/fixtures";
import { holdPlan, planChange, resumePlanAt, shiftPlan } from "./plan-actions";
import { nextHeat } from "./next-heat";

const main = plan("main");
const running = () => patch(withActuals(main, 8), idOf("p-r1-h3"), { startedAt: at("15:23") });
const finishedH3 = () => patch(running(), idOf("p-r1-h3"), { endedAt: at("15:35") });

describe("Hold, Resume at and Shift on server time", () => {
  it("Hold stores the server's moment, whatever the device thinks", () => {
    const held = holdPlan(main, at("15:30"), "wind dropped");
    expect(held.hold).toEqual({ since: at("15:30"), reason: "wind dropped" });
    expect(planChange(main, held)).toEqual({ hold: { since: at("15:30"), reason: "wind dropped" }, anchors: main.anchors });
  });
  it("Resume at 16:00 pins Heat 4 at 16:00 and clears the hold", () => {
    const resumed = resumePlanAt(holdPlan(main, at("15:30")), finishedH3(), "2026-10-03", "16:00", TZ);
    expect(resumed.hold).toBeUndefined();
    expect(resumed.anchors["p-r1-h4"]).toBe("16:00");
    expect(planChange(main, resumed).hold).toBeNull();
  });
  it("Shift +10 with Heat 3 still running pins Heat 4 at 15:48", () => {
    const shifted = shiftPlan(main, running(), 10, { timezone: TZ, eventDay: "2026-10-03", defaults: day.defaults, serverNowIso: at("15:31") });
    expect(shifted.anchors["p-r1-h4"]).toBe("15:48");
  });
  it("Shift refuses while the plan is on hold", () => {
    expect(() => shiftPlan(holdPlan(main, at("15:30")), running(), 5, { timezone: TZ, eventDay: "2026-10-03", defaults: day.defaults, serverNowIso: at("15:31") })).toThrow(/on hold/);
  });
});

describe("nextHeat (docs/08 §1G-13)", () => {
  it("after Pros R1 Heat 2 started at 15:08, the next heat is Pros R1 Heat 3 at 15:23", () => {
    const heats = patch(withActuals(main, 8), idOf("p-r1-h2"), { startedAt: at("15:08") });
    const next = nextHeat(main, heats, opts(at("15:10")));
    expect(next?.title).toContain("Heat 3");
    expect(next?.startsAt).toBe("15:23");
    expect(row(computeTimetable(main, heats, opts(at("15:10"))), "p-r1-h3").start).toBe("15:23");
  });
  it("no plan, no next heat; on hold it has no time", () => {
    expect(nextHeat(null, [], opts())).toBeNull();
    const held = nextHeat(holdPlan(main, at("15:30")), running(), opts(at("15:31")));
    expect(held?.held).toBe(true);
    expect(held?.startsAt).toBeNull();
  });
});
