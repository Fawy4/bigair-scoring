import { describe, expect, it } from "vitest";
import { DEFAULT_FLAGS } from "@/lib/schemas/flags";
import { flagState, hornsFor, type FlagHeat } from "./flags";
import { extendedHeat, extensionSec } from "./extend";
import { remainingMs } from "./timer";

// "+1 min" on a running heat: the server adds exactly 60 s of HEAT time (6 s at x10), the clock, the last-minute flag and the horn follow from that alone.
const T0 = Date.parse("2026-10-05T10:00:00Z");
const s = (n: number) => T0 + n * 1000;
const running = (over: Partial<FlagHeat> = {}): FlagHeat => ({ status: "running", durationSec: 600, startedAt: new Date(T0).toISOString(), pausedAt: null, pausedTotalSec: 0, armedAt: null, prestartSec: null, ...over });
const flag = (heat: FlagHeat, at: number) => flagState({ settings: DEFAULT_FLAGS, heat, nowMs: s(at) });

describe("the added time", () => {
  it("is one minute on a real heat and a minute of heat time on a simulation: 6 s at x10, 12 s at x5, 3 s at x20", () => {
    expect(extensionSec(1)).toBe(60);
    expect(extensionSec(undefined)).toBe(60);
    expect(extensionSec(5)).toBe(12);
    expect(extensionSec(10)).toBe(6);
    expect(extensionSec(20)).toBe(3);
  });
  it("adds exactly that to what is left, however often it is pressed, and nothing else changes", () => {
    const h = running();
    expect(remainingMs(h, s(560))).toBe(40_000);
    const once = extendedHeat(h);
    expect(remainingMs(once, s(560))).toBe(100_000);
    const thrice = extendedHeat(extendedHeat(once));
    expect(remainingMs(thrice, s(560))).toBe(220_000);
    expect(thrice.startedAt).toBe(h.startedAt);
    expect(thrice.pausedTotalSec).toBe(0);
    expect(thrice.durationSec).toBe(780);
  });
  it("at x10 a minute of heat time is 6 s on the clock", () => {
    const h = running({ durationSec: 60, timeScale: 10 }); // a 10-minute heat at x10
    expect(remainingMs(h, s(54))).toBe(6_000);
    expect(remainingMs(extendedHeat(h), s(54))).toBe(12_000);
  });
});

describe("the last minute is re-timed to the new end", () => {
  it("at 0:40 left the flag is the last minute; after +1 min it is green with 1:40 left, and the last minute begins again at 1:00", () => {
    const h = running();
    expect(flag(h, 560)).toMatchObject({ kind: "last_minute", countdownMs: 40_000 });
    const e = extendedHeat(h);
    expect(flag(e, 560)).toMatchObject({ kind: "running", countdownMs: 100_000 });
    expect(flag(e, 599)).toMatchObject({ kind: "running", countdownMs: 61_000 });
    expect(flag(e, 600)).toMatchObject({ kind: "last_minute", countdownMs: 60_000 });
    expect(flag(e, 659)).toMatchObject({ kind: "last_minute", countdownMs: 1_000 });
    expect(flag(e, 660)).toMatchObject({ kind: "stopped", why: "finished" }); // the heat ends at the NEW 0:00
  });
  it("a press before the last minute changes nothing but the time: still green", () => {
    expect(flag(extendedHeat(running()), 100)).toMatchObject({ kind: "running", countdownMs: 560_000 });
  });
  it("the horn: none for the flag going back to green, one when the last minute begins again", () => {
    const h = running();
    const before = flag(h, 560);
    const afterPress = flag(extendedHeat(h), 560);
    expect(hornsFor(before, afterPress)).toBe(0);
    expect(hornsFor(flag(extendedHeat(h), 599), flag(extendedHeat(h), 600))).toBe(1);
    // and then it does not sound again in the same minute
    expect(hornsFor(flag(extendedHeat(h), 600), flag(extendedHeat(h), 601))).toBe(0);
  });
  it("at x10 the last minute is 6 s: a press in it puts the flag back to green until the new last 6 s", () => {
    const h = running({ durationSec: 60, timeScale: 10 });
    expect(flag(h, 56)).toMatchObject({ kind: "last_minute" });
    const e = extendedHeat(h);
    expect(flag(e, 56)).toMatchObject({ kind: "running", countdownMs: 10_000 });
    expect(flag(e, 60)).toMatchObject({ kind: "last_minute", countdownMs: 6_000 });
    expect(flag(e, 66)).toMatchObject({ kind: "stopped", why: "finished" });
  });
});
