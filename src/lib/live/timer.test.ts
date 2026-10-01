// docs/08 §1G-1 (timer) and §1G-2 (cues). Heat of 600 s, started 10:00:00.
import { describe, expect, it } from "vitest";
import { clockOffset, effectiveStatus, formatClock, remainingMs, type HeatTiming } from "./timer";
import { timerCues } from "./timer-cues";

const t = (hhmmss: string) => Date.parse(`2026-10-01T${hhmmss}Z`);
const base: HeatTiming = { status: "running", durationSec: 600, startedAt: t("10:00:00"), pausedAt: null, pausedTotalSec: 0 };

describe("formatClock", () => {
  it("330 s is 5:30", () => expect(formatClock(330_000)).toBe("5:30"));
  it("420 s is 7:00", () => expect(formatClock(420_000)).toBe("7:00"));
  it("time up is 0:00", () => expect(formatClock(0)).toBe("0:00"));
  it("a full 10 minute heat is 10:00", () => expect(formatClock(600_000)).toBe("10:00"));
  it("a part second rounds up, so 0:00 only shows when time is really up", () => {
    expect(formatClock(59_001)).toBe("1:00");
    expect(formatClock(1)).toBe("0:01");
  });
  it("never negative", () => expect(formatClock(-5000)).toBe("0:00"));
});

describe("remainingMs", () => {
  const resumed: HeatTiming = { ...base, pausedTotalSec: 90 };
  it("running, paused 10:03:00–10:04:30, now 10:06:00 → 330 s, 5:30", () => {
    expect(remainingMs(resumed, t("10:06:00"))).toBe(330_000);
    expect(formatClock(remainingMs(resumed, t("10:06:00")))).toBe("5:30");
  });
  it("a device clock 40 s fast gives the same 5:30 once the offset is added", () => {
    const offset = clockOffset(t("10:00:40"), t("10:00:00") + 100, t("10:00:40") + 200);
    expect(offset).toBeCloseTo(-40_000, 5);
    const deviceNow = t("10:06:00") + 40_000;
    expect(remainingMs(resumed, deviceNow + offset)).toBe(330_000);
  });
  it("paused at 10:03:00, now 10:03:40 → frozen at 420 s, 7:00", () => {
    const paused: HeatTiming = { ...base, status: "paused", pausedAt: t("10:03:00") };
    expect(remainingMs(paused, t("10:03:40"))).toBe(420_000);
    expect(formatClock(remainingMs(paused, t("10:03:40")))).toBe("7:00");
    expect(remainingMs(paused, t("10:03:50"))).toBe(420_000);
  });
  it("time up: now 10:11:31 with 90 s paused → 0:00 and effectively ended; 10:11:29 still running with 1 s left", () => {
    expect(remainingMs(resumed, t("10:11:31"))).toBe(0);
    expect(formatClock(remainingMs(resumed, t("10:11:31")))).toBe("0:00");
    expect(effectiveStatus(resumed, t("10:11:31"))).toBe("ended");
    expect(remainingMs(resumed, t("10:11:29"))).toBe(1000);
    expect(effectiveStatus(resumed, t("10:11:29"))).toBe("running");
  });
  it("a paused heat is never effectively ended", () => {
    const paused: HeatTiming = { ...base, status: "paused", pausedAt: t("10:03:00") };
    expect(effectiveStatus(paused, t("12:00:00"))).toBe("paused");
  });
  it("a heat that has not started has its whole duration; one that is over has none", () => {
    expect(remainingMs({ status: "scheduled", durationSec: 600, startedAt: null, pausedAt: null, pausedTotalSec: 0 }, t("09:00:00"))).toBe(600_000);
    expect(remainingMs({ ...base, status: "ended" }, t("10:05:00"))).toBe(0);
  });
});

describe("timerCues", () => {
  it("61 000 → 59 500 gives one_minute", () => expect(timerCues(61_000, 59_500)).toBe("one_minute"));
  it("500 → 0 gives time_up", () => expect(timerCues(500, 0)).toBe("time_up"));
  it("59 000 → 58 000 gives nothing", () => expect(timerCues(59_000, 58_000)).toBeNull());
  it("paused gives nothing", () => expect(timerCues(61_000, 59_500, true)).toBeNull());
  it("a reload that starts below the threshold fires nothing", () => expect(timerCues(null, 30_000)).toBeNull());
  it("a long freeze over both gives only time_up", () => expect(timerCues(61_000, 0)).toBe("time_up"));
  it("already at zero fires nothing again", () => expect(timerCues(0, 0)).toBeNull());
});
