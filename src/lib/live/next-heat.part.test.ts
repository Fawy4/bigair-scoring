import { describe, expect, it } from "vitest";
import { DEFAULT_FLAGS } from "@/lib/schemas/flags";
import { flagState, flagWords, nextHeatPart, showsNextHeat, type FlagHeat } from "./flags";

const T0 = Date.parse("2026-10-05T10:00:00Z");
const info = { startMs: T0 + 220_000, title: "Advanced · R2 · Heat 12", est: "14:20" };
const ended: FlagHeat = { status: "ended", durationSec: 600, startedAt: new Date(T0 - 700_000).toISOString(), pausedAt: null, pausedTotalSec: 0, armedAt: null, prestartSec: null };
const flag = (nowMs: number) => flagState({ settings: DEFAULT_FLAGS, heat: ended, nowMs, anyHeatStarted: true })!;

describe("the red banner's second part: Next heat in …", () => {
  it("counts down to the next heat's start and shows the heat and its estimate", () => {
    expect(nextHeatPart(info, T0)).toBe("Next heat in 3:40 · Advanced · R2 · Heat 12 · est. 14:20");
    expect(nextHeatPart(info, T0 + 219_000)).toBe("Next heat in 0:01 · Advanced · R2 · Heat 12 · est. 14:20");
  });
  it("stays at 0:00 as 'Next heat due' and never goes negative; nothing about it starts anything", () => {
    expect(nextHeatPart(info, T0 + 220_000)).toBe("Next heat due · Advanced · R2 · Heat 12");
    expect(nextHeatPart(info, T0 + 900_000)).toBe("Next heat due · Advanced · R2 · Heat 12");
  });
  it("is absent when there is no run order to count from", () => {
    expect(nextHeatPart(null, T0)).toBeNull();
  });
  it("sits beside the state word, which stays exactly as it is: Finished", () => {
    const s = flag(T0);
    expect(s).toMatchObject({ kind: "stopped", why: "finished", label: "Finished" });
    expect(showsNextHeat(s)).toBe(true);
    expect(flagWords(s, "Heat 5, est. 10:40", true)).toBe("Finished"); // with the countdown beside it
    expect(flagWords(s, "Heat 5, est. 10:40")).toBe("Finished — next: Heat 5, est. 10:40"); // no run order: as today
  });
  it("is not shown for a pause, a hold or before the day", () => {
    const paused = flagState({ settings: DEFAULT_FLAGS, heat: { ...ended, status: "paused", pausedAt: new Date(T0).toISOString() }, nowMs: T0 })!;
    expect(showsNextHeat(paused)).toBe(false);
    expect(flagWords(paused, null, true)).toBe("Paused");
    expect(showsNextHeat(flagState({ settings: DEFAULT_FLAGS, heat: null, nowMs: T0, onHold: true, anyHeatStarted: true })!)).toBe(false);
  });
});
