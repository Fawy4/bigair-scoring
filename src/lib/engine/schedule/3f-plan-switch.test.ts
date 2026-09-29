// Doc 08 §3F — switching from Main to "Good wind" after the Women's heats have actual starts; Decision 10.
import { describe, expect, it } from "vitest";
import { activatePlan } from "./actions";
import { computeTimetable } from "./timetable";
import { at, day, opts, plan, row, withActuals } from "./fixtures";

// The Women's four heats ran under the main plan (10:30, 10:42, 10:56, 11:10).
const womenDone = () => withActuals(plan("main"), 4);
const good = () => plan("plan-a-good-wind");

describe("3F plan switch", () => {
  it("keeps the Women's actual starts (matched by heatId, not position) and moves them to the top", () => {
    const t = computeTimetable(good(), womenDone(), opts(at("11:30")));
    expect(t.rows.slice(0, 4).map((r) => [r.itemId, r.start, r.end, r.status])).toEqual([
      ["w-r1-h1", "10:30", "10:39", "done"],
      ["w-r1-h2", "10:42", "10:51", "done"],
      ["w-r2-h3", "10:56", "11:05", "done"],
      ["w-f", "11:10", "11:25", "done"],
    ]);
  });

  it("re-flows the rest in the new plan's order, from the last actual end + break", () => {
    const t = computeTimetable(good(), womenDone(), opts(at("11:30")));
    expect(t.rows.slice(4).map((r) => [r.itemId, r.start])).toEqual([
      ["a-r2-h4", "11:30"], // 11:25 + 5 min (a plan's trailing "0 min" is ignored once other rows follow)
      ["a-f", "11:50"],
      ["p-r1-h1", "12:23"],
      ["p-r1-h2", "12:38"],
      ["p-r1-h3", "12:53"],
      ["p-r1-h4", "13:08"],
      ["p-r2-h5", "13:25"],
      ["p-r2-h6", "13:44"],
      ["p-f", "14:05"],
    ]);
    expect(t.finish).toBe("14:23");
  });

  it("the new plan's own pin (09:30) is only 'not before' — it does not pull anything into the past", () => {
    const t = computeTimetable(good(), womenDone(), opts(at("11:30")));
    expect(row(t, "a-r2-h4")).toMatchObject({ pinned: true, start: "11:30" });
  });

  it("un-started rows are never projected earlier than now", () => {
    const t = computeTimetable(good(), womenDone(), opts(at("12:10")));
    expect(row(t, "a-r2-h4").start).toBe("12:10");
    expect(row(t, "a-f").start).toBe("12:30");
    expect(row(t, "p-r1-h1").start).toBe("13:03");
    expect(row(t, "p-f").start).toBe("14:45");
    expect(t.finish).toBe("15:03");
    // ...but the finished Women rows keep their real times.
    expect(row(t, "w-r1-h1").start).toBe("10:30");
  });

  it("pins stay with their own plan: switching does not copy the main plan's 14:00 pin", () => {
    const switched = activatePlan(day, "plan-a-good-wind");
    const active = switched.plans.find((p) => p.active)!;
    expect(active.anchors).toEqual({ "a-r2-h4": "09:30" });
    expect(computeTimetable(active, womenDone(), opts(at("11:30"))).rows.some((r) => r.start === "14:00")).toBe(false);
  });

  it("a switch mid-heat: the live heat stays at the top, the others follow", () => {
    const heats = womenDone().map((h) => (h.heatId === "Pros|Round 1|Heat 1" ? { ...h, startedAt: at("11:31") } : h));
    const t = computeTimetable(good(), heats, opts(at("11:35")));
    expect(t.rows[4]).toMatchObject({ itemId: "p-r1-h1", status: "live", start: "11:31", end: "11:43" });
    expect(row(t, "a-r2-h4").start).toBe("11:46"); // 11:43 + 3 min break of p-r1-h1
  });

  it("the switch itself needs no data migration: the same heats work on either plan", () => {
    const main = computeTimetable(plan("main"), womenDone(), opts(at("11:30")));
    expect(main.rows.slice(0, 4).map((r) => r.start)).toEqual(["10:30", "10:42", "10:56", "11:10"]);
    expect(main.finish).toBe("16:53");
  });
});
