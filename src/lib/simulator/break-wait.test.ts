import { describe, expect, it } from "vitest";
import type { SchedulePlan } from "@/lib/schemas/schedule";
import type { HeatLive } from "@/lib/engine/schedule";
import { at, DAY, TZ } from "@/lib/engine/schedule/fixtures";
import { armDecision, breakStartFor, scaledPrestartSec } from "./break-wait";

// Polish 3, item 3. A break of 4 minutes, no warm-up, at x10 is 24 seconds; the 1-minute pre-start is 6 seconds: the yellow begins 18 seconds after the heat ended.
const defaults = { breakAfterHeatMin: 4, breakAfterRoundMin: 4, readyCallMin: 0 };
const heat = (n: string, extra: Partial<HeatLive> = {}): HeatLive => ({ heatId: n, division: "Pro Men", round: "R1", heat: `Heat ${n}`, durationMin: 10, warmUpMin: 0, breakAfterHeatMin: 4, breakAfterRoundMin: 4, ...extra });
const plan: SchedulePlan = { id: "p", name: "A", active: true, anchors: { "i-H1": "10:00" }, actualStarts: {}, items: ["H1", "H2", "H3"].map((id) => ({ id: `i-${id}`, kind: "heat" as const, heatId: id })) };
const sec = (hhmmss: string) => at(hhmmss.slice(0, 5)).replace(":00.000Z", `:${hhmmss.slice(6, 8)}.000Z`);
const ms = (hhmmss: string) => Date.parse(sec(hhmmss));
const afterH1 = [heat("H1", { startedAt: at("10:00"), endedAt: sec("10:01:00") }), heat("H2"), heat("H3")];
const opts = (nowMs: number, speed: number) => ({ timezone: TZ, eventDay: DAY, defaults, nowMs, speed });

describe("the simulator's pre-start length (same rule as the database)", () => {
  it("is the setting at x1 and divided by the speed (never under 3 s) above", () => {
    expect(scaledPrestartSec(60, 1)).toBe(60);
    expect(scaledPrestartSec(60, 10)).toBe(6);
    expect(scaledPrestartSec(60, 20)).toBe(3);
    expect(scaledPrestartSec(10, 20)).toBe(3);
    expect(scaledPrestartSec(0, 10)).toBe(0);
  });
});

describe("the start time of the next heat on the run order", () => {
  it("is the end of the last heat plus the break, divided by the speed", () => {
    expect(breakStartFor(plan, afterH1, opts(ms("10:01:05"), 10))).toEqual({ heatId: "H2", startMs: ms("10:01:24") });
    expect(breakStartFor(plan, afterH1, opts(ms("10:01:05"), 1))).toEqual({ heatId: "H2", startMs: ms("10:05:00") });
  });
  it("is null with no run order, no finished heat, or a heat on the water (nothing to wait for)", () => {
    expect(breakStartFor(null, afterH1, opts(ms("10:01:05"), 10))).toBeNull();
    expect(breakStartFor(plan, [heat("H1"), heat("H2")], opts(ms("10:01:05"), 10))).toBeNull();
    expect(breakStartFor(plan, [heat("H1", { startedAt: at("10:00") }), heat("H2")], opts(ms("10:01:05"), 10))).toBeNull();
  });
});

describe("when auto-play arms the next heat", () => {
  it("break 4 min at x10 with a 1-min pre-start: the yellow begins 18 s after the heat ended, so the yellow ends at the plan's start", () => {
    const start = ms("10:01:24");
    const early = armDecision({ startMs: start, nowMs: ms("10:01:01"), prestartSec: 6, flagsOn: true });
    expect(early).toEqual({ kind: "wait", armAtMs: ms("10:01:18"), startMs: start });
    expect(armDecision({ startMs: start, nowMs: ms("10:01:17"), prestartSec: 6, flagsOn: true })).toMatchObject({ kind: "wait" });
    expect(armDecision({ startMs: start, nowMs: ms("10:01:18"), prestartSec: 6, flagsOn: true })).toEqual({ kind: "now" });
  });
  it("never earlier than that: the yellow ends exactly at the start when armed at that moment", () => {
    const d = armDecision({ startMs: ms("10:01:24"), nowMs: ms("10:01:00"), prestartSec: 6, flagsOn: true });
    expect(d.kind === "wait" && d.armAtMs + 6_000).toBe(ms("10:01:24"));
  });
  it("a heat the plan says is already due is armed at once, as before", () => {
    expect(armDecision({ startMs: ms("10:01:24"), nowMs: ms("10:03:00"), prestartSec: 6, flagsOn: true })).toEqual({ kind: "now" });
    expect(armDecision({ startMs: null, nowMs: ms("10:03:00"), prestartSec: 6, flagsOn: true })).toEqual({ kind: "now" });
  });
  it("a pre-start longer than the break arms at once (it cannot end before it begins)", () => {
    expect(armDecision({ startMs: ms("10:01:24"), nowMs: ms("10:01:20"), prestartSec: 60, flagsOn: true })).toEqual({ kind: "now" });
  });
  it("with the flags off there is no yellow: the heat starts at the plan's start", () => {
    expect(armDecision({ startMs: ms("10:01:24"), nowMs: ms("10:01:10"), prestartSec: 6, flagsOn: false })).toEqual({ kind: "wait", armAtMs: ms("10:01:24"), startMs: ms("10:01:24") });
  });
});
