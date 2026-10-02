import { describe, expect, it } from "vitest";
import { elapsedSec, fastDuration, fractionDone, remainingSec, scaledSec, sinceStartSec, timeIsUp, type HeatClock } from "./clock";

const T0 = Date.parse("2026-10-16T10:00:00Z");
const heat = (over: Partial<HeatClock> = {}): HeatClock => ({ status: "running", startedAt: "2026-10-16T10:00:00Z", pausedAt: null, pausedTotalSec: 0, durationSec: 60, ...over });

describe("the fast clock maths", () => {
  it("divides the heat's length by the speed", () => {
    expect(fastDuration(600, 1)).toBe(600);
    expect(fastDuration(600, 5)).toBe(120);
    expect(fastDuration(600, 10)).toBe(60);
    expect(fastDuration(600, 20)).toBe(30);
  });
  it("rounds up and never goes below three seconds", () => {
    expect(fastDuration(605, 10)).toBe(61);
    expect(fastDuration(20, 20)).toBe(3);
    expect(fastDuration(1, 20)).toBe(3);
  });
  it("a minute offline is shorter at a faster speed", () => {
    expect(scaledSec(60, 1)).toBe(60);
    expect(scaledSec(60, 10)).toBe(6);
    expect(scaledSec(5, 20)).toBe(1);
  });
  it("elapsed time follows the server timestamps", () => {
    expect(elapsedSec(heat(), T0 + 15_000)).toBe(15);
    expect(fractionDone(heat(), T0 + 15_000)).toBeCloseTo(0.25);
    expect(remainingSec(heat(), T0 + 15_000)).toBe(45);
  });
  it("never beyond the length, and nothing before the start", () => {
    expect(elapsedSec(heat(), T0 + 500_000)).toBe(60);
    expect(elapsedSec(heat({ status: "scheduled", startedAt: null }), T0)).toBe(0);
    expect(elapsedSec(heat(), T0 - 5_000)).toBe(0);
  });
  it("a pause freezes the clock, and paused time is not counted", () => {
    expect(elapsedSec(heat({ status: "paused", pausedAt: "2026-10-16T10:00:10Z" }), T0 + 50_000)).toBe(10);
    expect(elapsedSec(heat({ pausedTotalSec: 20 }), T0 + 50_000)).toBe(30);
  });
  it("time is up only for a running heat", () => {
    expect(timeIsUp(heat(), T0 + 61_000)).toBe(true);
    expect(timeIsUp(heat(), T0 + 30_000)).toBe(false);
    expect(timeIsUp(heat({ status: "paused", pausedAt: "2026-10-16T10:00:10Z" }), T0 + 300_000)).toBe(false);
  });
  it("seconds since the start are not capped", () => {
    expect(sinceStartSec(heat(), T0 + 90_000)).toBe(90);
    expect(sinceStartSec({ startedAt: null }, T0)).toBe(0);
  });
});
