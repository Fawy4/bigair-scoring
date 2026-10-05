// Polish 4, I: the head judge's break controls change the REAL break (the run order), to the second. Heat 10 min, warm-up 5, break after a heat 2: the next heat starts
// 7 minutes after the last one ended. H1 ended at 10:10:30, so H2 starts at 10:17:30 (the console's "Next heat in 4:30" at 10:13:00).
import { describe, expect, it } from "vitest";
import type { SchedulePlan } from "@/lib/schemas/schedule";
import { breakCountdown, setBreak } from "./break";
import { computeTimetable } from "./timetable";
import { at, DAY, TZ } from "./fixtures";
import type { HeatLive } from "./types";

const defaults = { breakAfterHeatMin: 2, breakAfterRoundMin: 2, readyCallMin: 15 };
const heat = (n: string, extra: Partial<HeatLive> = {}): HeatLive => ({ heatId: n, division: "Pro Men", round: "R1", heat: `Heat ${n}`, durationMin: 10, warmUpMin: 5, breakAfterHeatMin: 2, breakAfterRoundMin: 2, ...extra });
const plan = (ids: string[], extra: Partial<SchedulePlan> = {}): SchedulePlan => ({ id: "p", name: "A", active: true, anchors: { "i-H1": "10:00" }, actualStarts: {}, items: ids.map((id) => ({ id: `i-${id}`, kind: "heat" as const, heatId: id })), ...extra });
const sec = (hhmmss: string) => at(hhmmss.slice(0, 5)).replace(":00.000Z", `:${hhmmss.slice(6, 8)}.000Z`);
const ctx = (now: string) => ({ timezone: TZ, eventDay: DAY, defaults, now });
const afterH1 = (): HeatLive[] => [heat("H1", { startedAt: at("10:00"), endedAt: sec("10:10:30") }), heat("H2"), heat("H3")];
const startOf = (p: SchedulePlan, heats: HeatLive[], id: string) => computeTimetable(p, heats, { timezone: TZ, eventDay: DAY, defaults }).rows.find((r) => r.heatId === id)!.startUtc!;
const P = plan(["H1", "H2", "H3"]);

describe("+1 min on the break", () => {
  it("out of order with the last plan item run first: the explicit break is ignored by the timetable, so the next heat is pinned to the next whole minute", () => {
    const two = plan(["H1", "H2"], { anchors: { "i-H1": "10:00" } });
    const heats = [heat("H1"), heat("H2", { startedAt: at("10:00"), endedAt: sec("10:10:30") })];
    const before = Date.parse(startOf(two, heats, "H1"));
    const r = setBreak(two, heats, { add: { minutes: 1 } }, ctx(sec("10:13:00")));
    const after = Date.parse(startOf(r.plan, heats, "H1"));
    expect(after - before).toBeGreaterThanOrEqual(60_000 - 1500);
    expect(after - before).toBeLessThanOrEqual(120_000 + 1500);
    expect(r.plan.anchors["i-H1"]).toBeDefined();
  });
  it("works when a heat was run out of order (the break cannot sit on the plan's last item then, so the next heat is pinned to the next whole minute)", () => {
    const heats = [heat("H1"), heat("H2", { startedAt: at("10:00"), endedAt: sec("10:10:30") }), heat("H3")];
    const r = setBreak(P, heats, { add: { minutes: 1 } }, ctx(sec("10:13:00")));
    expect(r.itemId).toBe("i-H1"); // H1 is still the next heat in the run order
    expect(r.prevItemId).toBe("i-H2"); // the break after H2 (it ended last) is the one that moved
    expect(Date.parse(startOf(r.plan, heats, "H1")) - Date.parse(startOf(P, heats, "H1"))).toBe(60_000);
  });
  it("moves the next heat's start by exactly 60 seconds, to the second (no rounding to the minute)", () => {
    const r = setBreak(P, afterH1(), { add: { minutes: 1 } }, ctx(sec("10:13:00")));
    expect(startOf(r.plan, afterH1(), "H2")).toBe(sec("10:18:30")); // 10:17:30 + 1:00
    expect(breakCountdown(r.plan, afterH1(), ctx(sec("10:13:00")))).toMatchObject({ state: "counting", remainingMs: 330_000 });
    expect(r.breakMin).toBeCloseTo(3, 5); // the break after H1 is now 3 minutes (it was 2)
  });
  it("repeats: three presses are three minutes", () => {
    let p = P;
    for (let i = 0; i < 3; i++) p = setBreak(p, afterH1(), { add: { minutes: 1 } }, ctx(sec("10:13:00"))).plan;
    expect(startOf(p, afterH1(), "H2")).toBe(sec("10:20:30"));
  });
  it("everything after it re-flows: H3 follows H2's new start", () => {
    const before = startOf(P, afterH1(), "H3");
    const r = setBreak(P, afterH1(), { add: { minutes: 1 } }, ctx(sec("10:13:00")));
    expect(Date.parse(startOf(r.plan, afterH1(), "H3")) - Date.parse(before)).toBe(60_000);
  });
  it("replaces a pin on the next heat (a pin is 'not before': it would hide the change) and says so", () => {
    const pinned = plan(["H1", "H2", "H3"], { anchors: { "i-H1": "10:00", "i-H2": "10:30" } });
    const r = setBreak(pinned, afterH1(), { add: { minutes: 1 } }, ctx(sec("10:13:00")));
    expect(r.plan.anchors["i-H2"]).toBeUndefined();
    expect(r.replacedPin).toBe("10:30");
    expect(startOf(r.plan, afterH1(), "H2")).toBe(sec("10:31:00")); // the pin held it at 10:30; +1 min from there
  });
  it("a simulation at x10: a minute of break is 6 seconds on the countdown", () => {
    const r = setBreak(P, afterH1(), { add: { minutes: 1 } }, { ...ctx(sec("10:10:30")), timeScale: 10 });
    expect(breakCountdown(r.plan, afterH1(), { ...ctx(sec("10:10:30")), timeScale: 10 })).toMatchObject({ remainingMs: 48_000 }); // 42 s + 6 s
  });
});

describe("Other…: a break of a given length from the end of the last heat", () => {
  const shortWarm = (): HeatLive[] => [heat("H1", { startedAt: at("10:00"), endedAt: sec("10:10:30") }), heat("H2", { warmUpMin: 1 }), heat("H3", { warmUpMin: 1 })];
  it("2:30 after the heat ended at 10:10:30 puts the next start at 10:13:00, to the second (warm-up 1 minute inside it)", () => {
    const r = setBreak(P, shortWarm(), { length: { ms: 150_000 } }, ctx(sec("10:10:40")));
    expect(startOf(r.plan, shortWarm(), "H2")).toBe(sec("10:13:00"));
    expect(breakCountdown(r.plan, shortWarm(), ctx(sec("10:10:40")))).toMatchObject({ remainingMs: 140_000 });
  });
  it("cannot go below the warm-up: a break of 0:30 gives the earliest start, end + warm-up (5 min)", () => {
    const r = setBreak(P, afterH1(), { length: { ms: 30_000 } }, ctx(sec("10:10:40")));
    expect(startOf(r.plan, afterH1(), "H2")).toBe(sec("10:15:30"));
  });
});

describe("refusals", () => {
  it("not while the plan is on hold, with no ended heat, or with nothing left to start", () => {
    expect(() => setBreak({ ...P, hold: { since: sec("10:11:00") } }, afterH1(), { add: { minutes: 1 } }, ctx(sec("10:12:00")))).toThrow(/hold/i);
    expect(() => setBreak(P, [heat("H1"), heat("H2"), heat("H3")], { add: { minutes: 1 } }, ctx(sec("09:50:00")))).toThrow(/break/i);
    const done = [heat("H1", { startedAt: at("10:00"), endedAt: at("10:10") }), heat("H2", { startedAt: at("10:17"), endedAt: at("10:27") }), heat("H3", { startedAt: at("10:34"), endedAt: at("10:44") })];
    expect(() => setBreak(P, done, { add: { minutes: 1 } }, ctx(sec("10:45:00")))).toThrow();
  });
});
