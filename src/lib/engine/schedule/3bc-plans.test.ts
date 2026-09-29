// Doc 08 §3B/§3C — alternative plans for bad and good wind, anchored 09:30.
import { describe, expect, it } from "vitest";
import { computeTimetable } from "./timetable";
import { allHeats, opts, plan, starts } from "./fixtures";

describe("3B Plan A – Bad wind", () => {
  const t = computeTimetable(plan("plan-a-bad-wind"), allHeats(), opts());
  it("starts 09:30, 09:50, 10:23, 10:38, 10:53, 11:08, 11:25, 11:37, 11:51, 12:05", () => {
    expect(starts(t)).toEqual(["09:30", "09:50", "10:23", "10:38", "10:53", "11:08", "11:25", "11:37", "11:51", "12:05"]);
  });
  it("finishes 12:20", () => {
    expect(t.finish).toBe("12:20");
    expect(t.finish).toBe(plan("plan-a-bad-wind").expectedFinish);
  });
  it("runs in the documented order", () => {
    expect(t.rows.map((r) => r.itemId)).toEqual(["a-r2-h4", "a-f", "p-r1-h1", "p-r1-h2", "p-r1-h3", "p-r1-h4", "w-r1-h1", "w-r1-h2", "w-r2-h3", "w-f"]);
  });
});

describe("3C Plan A – Good wind", () => {
  const t = computeTimetable(plan("plan-a-good-wind"), allHeats(), opts());
  it("starts 09:30, 09:50, 10:23, 10:38, 10:53, 11:08, 11:25, 11:44, 12:05, 12:38, 12:50, 13:04, 13:18", () => {
    expect(starts(t)).toEqual(["09:30", "09:50", "10:23", "10:38", "10:53", "11:08", "11:25", "11:44", "12:05", "12:38", "12:50", "13:04", "13:18"]);
  });
  it("finishes 13:33", () => {
    expect(t.finish).toBe("13:33");
    expect(t.finish).toBe(plan("plan-a-good-wind").expectedFinish);
  });
  it("adds Pros R2 H5, H6 and the Pros Final between Pros R1 H4 and the Women", () => {
    expect(t.rows.map((r) => r.itemId).slice(5, 10)).toEqual(["p-r1-h4", "p-r2-h5", "p-r2-h6", "p-f", "w-r1-h1"]);
  });
});
