// Doc 08 §3E — wind hold, resume, shift; Decisions 8 and 11 (running over / pause).
import { describe, expect, it } from "vitest";
import { activatePlan, resumeHold, shift, startHold } from "./actions";
import { computeTimetable } from "./timetable";
import { at, day, idOf, opts, patch, plan, row, TZ, withActuals } from "./fixtures";

const main = plan("main");
// Women ×4, Advanced ×2, Pros R1 H1 and H2 ran to plan; Pros R1 H3 started 15:23.
const running = () => patch(withActuals(main, 8), idOf("p-r1-h3"), { startedAt: at("15:23") });
const finishedH3 = () => patch(running(), idOf("p-r1-h3"), { endedAt: at("15:35") });

describe("3E hold", () => {
  const held = startHold(main, at("15:30"), "wind dropped");
  const t = computeTimetable(held, running(), opts(at("15:31")));

  it("Heat 3 keeps its actual start", () => {
    expect(row(t, "p-r1-h3")).toMatchObject({ start: "15:23", status: "live" });
  });

  it("all un-started rows show `held` without times", () => {
    const rest = t.rows.filter((r) => ["p-r1-h4", "p-r2-h5", "p-r2-h6", "p-f"].includes(r.itemId));
    expect(rest).toHaveLength(4);
    for (const r of rest) {
      expect(r).toMatchObject({ status: "held", start: null, end: null, startUtc: null, endUtc: null, readyCall: null });
      expect(r.reason).toBe("Wind hold since 15:30 (wind dropped): no time until the head judge resumes");
    }
  });

  it("finished rows are unaffected and there is no projected finish while held", () => {
    expect(row(t, "w-f")).toMatchObject({ start: "11:10", status: "done" });
    expect(t.finish).toBeNull();
  });

  it("does not change the plan it was given", () => {
    const before = JSON.stringify(main);
    startHold(main, at("15:30"));
    expect(JSON.stringify(main)).toBe(before);
    expect(main.hold).toBeUndefined();
    expect(held.hold).toEqual({ since: at("15:30"), reason: "wind dropped" });
  });
});

describe("3E resume at 16:00", () => {
  const held = startHold(main, at("15:30"));
  const resumed = resumeHold(held, finishedH3(), at("16:00"), { timezone: TZ });
  const t = computeTimetable(resumed, finishedH3(), opts(at("16:00")));

  it("pins Heat 4 at 16:00 and clears the hold", () => {
    expect(resumed.hold).toBeUndefined();
    expect(resumed.anchors["p-r1-h4"]).toBe("16:00");
    expect(row(t, "p-r1-h4")).toMatchObject({ start: "16:00", pinned: true, status: "next" });
  });

  it("Heat 5 16:17, Heat 6 16:36, Final 16:57", () => {
    expect(["p-r2-h5", "p-r2-h6", "p-f"].map((id) => row(t, id).start)).toEqual(["16:17", "16:36", "16:57"]);
    expect(t.finish).toBe("17:15");
  });

  it("refuses to resume a plan that is not on hold", () => {
    expect(() => resumeHold(main, finishedH3(), at("16:00"), { timezone: TZ })).toThrow(/not on hold/);
  });
});

describe("3E shift +10", () => {
  const heats = finishedH3();
  const shifted = shift(main, heats, 10, opts(at("15:30")));
  const t = computeTimetable(shifted, heats, opts(at("15:30")));

  it("pins Heat 4 at 15:48 (15:38 + 10)", () => {
    expect(shifted.anchors["p-r1-h4"]).toBe("15:48");
    expect(row(t, "p-r1-h4")).toMatchObject({ start: "15:48", pinned: true });
  });

  it("the rest cascades: Heat 5 16:05, Heat 6 16:24, Final 16:45", () => {
    expect(["p-r2-h5", "p-r2-h6", "p-f"].map((id) => row(t, id).start)).toEqual(["16:05", "16:24", "16:45"]);
    expect(t.finish).toBe("17:03");
  });

  it("shifting twice adds up (+5, +5 = +10)", () => {
    const once = shift(main, heats, 5, opts(at("15:30")));
    const twice = shift(once, heats, 5, opts(at("15:30")));
    expect(twice.anchors["p-r1-h4"]).toBe("15:48");
  });

  it("cannot shift while on hold, or when nothing is left", () => {
    expect(() => shift(startHold(main, at("15:30")), heats, 10, opts())).toThrow(/on hold/);
    const allDone = withActuals(main, 13);
    expect(() => shift(main, allDone, 10, opts())).toThrow(/every item has started/);
  });
});

describe("3E running over and pause (Decision 11)", () => {
  it("a heat that is still running after its time ends 'now': later rows slip live", () => {
    const t = computeTimetable(main, running(), opts(at("15:45")));
    expect(row(t, "p-r1-h3")).toMatchObject({ start: "15:23", end: "15:45", status: "live" });
    expect(row(t, "p-r1-h3").warnings).toEqual(["Running over its 12 min: later heats move back until it ends."]);
    expect(row(t, "p-r1-h4").start).toBe("15:48"); // 15:45 + 3 min break
    expect(t.finish).toBe("17:03");
  });

  it("while it is still inside its time nothing slips", () => {
    const t = computeTimetable(main, running(), opts(at("15:30")));
    expect(row(t, "p-r1-h3").end).toBe("15:35");
    expect(row(t, "p-r1-h4").start).toBe("15:38");
    expect(row(t, "p-r1-h3").warnings).toEqual([]);
  });

  it("paused minutes extend the projected end: 15:23 + 12 + 5 = 15:40", () => {
    const paused = patch(running(), idOf("p-r1-h3"), { pausedMin: 5 });
    const t = computeTimetable(main, paused, opts(at("15:30")));
    expect(row(t, "p-r1-h3").end).toBe("15:40");
    expect(row(t, "p-r1-h4").start).toBe("15:43");
    expect(row(t, "p-r1-h3").reason).toBe("Started 15:23; ends about 15:40 (5 min paused)");
  });

  it("un-started rows are never projected before now", () => {
    const t = computeTimetable(main, withActuals(main, 4), opts(at("13:00"))); // Women done, Advanced not started, 13:00 is before its pin
    expect(row(t, "a-r2-h4").start).toBe("14:00");
    const late = computeTimetable(main, withActuals(main, 4), opts(at("14:30")));
    expect(row(late, "a-r2-h4")).toMatchObject({ start: "14:30", status: "next" });
    expect(row(late, "a-r2-h4").reason).toBe("Not before now (14:30): nothing runs in the past");
    expect(row(late, "a-f").start).toBe("14:50");
  });
});

describe("3E activatePlan (used by 3F)", () => {
  it("flips exactly one plan to active and leaves the rest of the day alone", () => {
    const next = activatePlan(day, "plan-a-good-wind");
    expect(next.plans.map((p) => [p.id, p.active])).toEqual([["main", false], ["plan-a-bad-wind", false], ["plan-a-good-wind", true]]);
    expect(day.plans[0].active).toBe(true); // input untouched
    expect(next.plans[0].anchors).toEqual(day.plans[0].anchors); // pins stay with their plan
  });
  it("refuses an unknown plan", () => {
    expect(() => activatePlan(day, "nope")).toThrow(/No plan/);
  });
});
