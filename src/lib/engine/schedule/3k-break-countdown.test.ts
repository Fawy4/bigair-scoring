// Console v2 — the break countdown, "+1 min", "Pause break" and the "next heat in the run order" check, on the real timetable engine.
// Heat 10 min, warm-up 5, break after a heat 2 (so the next heat starts 7 minutes after the previous one ended). Pins hold whole minutes only,
// so "+1 min" and the resume after a pause round UP to the next whole minute (owner's decision, 1 Oct 2026).
import { describe, expect, it } from "vitest";
import type { SchedulePlan } from "@/lib/schemas/schedule";
import { breakCountdown, extendBreak, nextHeatInOrder, resumeBreak, startsOutOfOrder } from "./break";
import { computeTimetable } from "./timetable";
import { at, DAY, TZ } from "./fixtures";
import type { HeatLive } from "./types";

const defaults = { breakAfterHeatMin: 2, breakAfterRoundMin: 2, readyCallMin: 15 };
const heat = (n: string, extra: Partial<HeatLive> = {}): HeatLive => ({ heatId: n, division: "Pro Men", round: "R1", heat: `Heat ${n}`, durationMin: 10, warmUpMin: 5, breakAfterHeatMin: 2, breakAfterRoundMin: 2, ...extra });
const plan = (ids: string[], extra: Partial<SchedulePlan> = {}): SchedulePlan => ({ id: "p", name: "A", active: true, anchors: { "i-H1": "10:00" }, actualStarts: {}, items: ids.map((id) => ({ id: `i-${id}`, kind: "heat" as const, heatId: id })), ...extra });
const ctx = (now: string) => ({ timezone: TZ, eventDay: DAY, defaults, now });
const sec = (hhmmss: string) => at(hhmmss.slice(0, 5)).replace(":00.000Z", `:${hhmmss.slice(6, 8)}.000Z`);
const startOf = (p: SchedulePlan, heats: HeatLive[], id: string, now?: string) => computeTimetable(p, heats, { timezone: TZ, eventDay: DAY, defaults, ...(now ? { now } : {}) }).rows.find((r) => r.heatId === id)!.start;

// H1 ran 10:00 to 10:10:30 (the head judge pressed End at 10:10:30); H2 and H3 are not started.
const afterH1 = (): HeatLive[] => [heat("H1", { startedAt: at("10:00"), endedAt: sec("10:10:30") }), heat("H2"), heat("H3")];
const P = plan(["H1", "H2", "H3"]);

describe("break countdown: 'Next: R1 · H2 · starts in …'", () => {
  it("counts down to the end of the heat + break + warm-up (10:10:30 + 2 + 5 min = 10:17:30)", () => {
    const c = breakCountdown(P, afterH1(), ctx(sec("10:13:00")));
    expect(c).toMatchObject({ kind: "break", state: "counting", heatId: "H2", startUtc: sec("10:17:30"), remainingMs: 270_000 }); // 4:30
  });

  it("is due, never negative, once the start has passed; it does not creep forward because of the 'nothing runs in the past' rule", () => {
    const c = breakCountdown(P, afterH1(), ctx(sec("10:19:00")));
    expect(c).toMatchObject({ kind: "break", state: "due", heatId: "H2", remainingMs: 0, lateMs: 90_000 });
    // a minute later it is still the same start, just later
    expect(breakCountdown(P, afterH1(), ctx(sec("10:20:00")))).toMatchObject({ state: "due", startUtc: sec("10:17:30"), lateMs: 150_000 });
  });

  it("names the next heat of the run order, skipping a heat that was cancelled before it started", () => {
    const heats = [heat("H1", { startedAt: at("10:00"), endedAt: sec("10:10:30") }), heat("H2", { cancelled: true }), heat("H3")];
    expect(breakCountdown(plan(["H1", "H2", "H3"]), heats, ctx(sec("10:11:00")))).toMatchObject({ heatId: "H3", startUtc: sec("10:17:30") });
  });

  it("a cancelled heat that had run counts as a heat that ended: the re-run is next and its break counts from the cancel", () => {
    const heats = [heat("H1", { startedAt: at("10:00"), endedAt: sec("10:06:00"), cancelled: true }), heat("H1R"), heat("H2")];
    const c = breakCountdown(plan(["H1", "H1R", "H2"]), heats, ctx(sec("10:07:00")));
    expect(c).toMatchObject({ kind: "break", heatId: "H1R", startUtc: sec("10:13:00"), remainingMs: 360_000 });
  });

  it("is hidden, with a reason, when there is nothing to count: no run order, a heat on, no heat has ended, nothing left", () => {
    expect(breakCountdown(null, afterH1(), ctx(sec("10:13:00")))).toEqual({ kind: "none", reason: "no-plan" });
    expect(breakCountdown(P, [heat("H1", { startedAt: at("10:00") }), heat("H2"), heat("H3")], ctx(sec("10:05:00")))).toEqual({ kind: "none", reason: "heat-running" });
    expect(breakCountdown(P, [heat("H1"), heat("H2"), heat("H3")], ctx(sec("09:50:00")))).toEqual({ kind: "none", reason: "no-ended-heat" });
    const allDone = [heat("H1", { startedAt: at("10:00"), endedAt: at("10:10") }), heat("H2", { startedAt: at("10:17"), endedAt: at("10:27") }), heat("H3", { startedAt: at("10:34"), endedAt: at("10:44") })];
    expect(breakCountdown(P, allDone, ctx(sec("10:45:00")))).toEqual({ kind: "none", reason: "nothing-next" });
  });

  it("takes a pin into account: H2 pinned 'not before 10:30' counts down to 10:30", () => {
    const pinned = plan(["H1", "H2", "H3"], { anchors: { "i-H1": "10:00", "i-H2": "10:30" } });
    expect(breakCountdown(pinned, afterH1(), ctx(sec("10:13:00")))).toMatchObject({ startUtc: at("10:30"), remainingMs: 17 * 60_000 });
  });
});

describe("+1 min: the break is one minute longer and everything after moves with it", () => {
  it("pins the next heat at its start + 1 min, rounded up to the minute: 10:17:30 + 1 = 10:18:30 → 10:19", () => {
    const p2 = extendBreak(P, afterH1(), 1, ctx(sec("10:13:00")));
    expect(p2.anchors["i-H2"]).toBe("10:19");
    expect(startOf(p2, afterH1(), "H2", sec("10:13:00"))).toBe("10:19");
    // H3 follows H2's real end: 10:19 + 10 + 2 + 5 = 10:36 (it was 10:34:30)
    expect(startOf(p2, afterH1(), "H3", sec("10:13:00"))).toBe("10:36");
  });

  it("when the start is on a whole minute it is exactly one minute: 10:17:00 → 10:18", () => {
    const heats = [heat("H1", { startedAt: at("10:00"), endedAt: at("10:10") }), heat("H2"), heat("H3")];
    expect(extendBreak(P, heats, 1, ctx(at("10:12"))).anchors["i-H2"]).toBe("10:18");
  });

  it("never gives less than a minute and never more than two: the countdown grows by 60 to 119 seconds", () => {
    const startUtc = (p: SchedulePlan, heats: HeatLive[]) => Date.parse((breakCountdown(p, heats, ctx(at("10:11"))) as { startUtc: string }).startUtc);
    for (const s of ["00", "01", "15", "30", "45", "59"]) {
      const heats = [heat("H1", { startedAt: at("10:00"), endedAt: sec(`10:10:${s}`) }), heat("H2"), heat("H3")];
      const grew = startUtc(extendBreak(P, heats, 1, ctx(at("10:11"))), heats) - startUtc(P, heats);
      expect(grew).toBeGreaterThanOrEqual(60_000);
      expect(grew).toBeLessThan(120_000);
    }
  });

  it("pressed twice it adds two minutes in total (each press is a new pin on the previous one)", () => {
    const once = extendBreak(P, afterH1(), 1, ctx(sec("10:13:00")));
    const twice = extendBreak(once, afterH1(), 1, ctx(sec("10:13:05")));
    expect(twice.anchors["i-H2"]).toBe("10:20");
  });

  it("when the head judge is already late it adds the minute from now, not from the stale start", () => {
    const p2 = extendBreak(P, afterH1(), 1, ctx(sec("10:21:10"))); // start was 10:17:30, now 10:21:10 → 10:22:10 → 10:23
    expect(p2.anchors["i-H2"]).toBe("10:23");
  });

  it("pins the heat that is really next, not a heat that was cancelled before it started", () => {
    const heats = [heat("H1", { startedAt: at("10:00"), endedAt: sec("10:10:30") }), heat("H2", { cancelled: true }), heat("H3")];
    const p2 = extendBreak(plan(["H1", "H2", "H3"]), heats, 1, ctx(sec("10:13:00")));
    expect(p2.anchors["i-H3"]).toBe("10:19");
    expect(p2.anchors["i-H2"]).toBeUndefined();
  });

  it("refuses on a hold, and when nothing is left; never changes the plan it was given", () => {
    const held = { ...P, hold: { since: at("10:12") } };
    expect(() => extendBreak(held, afterH1(), 1, ctx(sec("10:13:00")))).toThrow(/on hold/i);
    const allDone = [heat("H1", { startedAt: at("10:00"), endedAt: at("10:10") }), heat("H2", { startedAt: at("10:17"), endedAt: at("10:27") }), heat("H3", { startedAt: at("10:34"), endedAt: at("10:44") })];
    expect(() => extendBreak(P, allDone, 1, ctx(at("10:45")))).toThrow(/nothing left/i);
    const before = JSON.stringify(P);
    extendBreak(P, afterH1(), 1, ctx(sec("10:13:00")));
    expect(JSON.stringify(P)).toBe(before);
  });
});

describe("Pause break (a hold) and Resume", () => {
  it("while held the countdown stops at what was left when it was paused: 10:17:30 − 10:13:00 = 4:30", () => {
    const held = { ...P, hold: { since: sec("10:13:00") } };
    expect(breakCountdown(held, afterH1(), ctx(sec("10:15:00")))).toMatchObject({ kind: "break", state: "paused", heatId: "H2", remainingMs: 270_000 });
    expect(breakCountdown(held, afterH1(), ctx(sec("10:40:00")))).toMatchObject({ state: "paused", remainingMs: 270_000 });
  });

  it("Resume pins the next heat at now + what was left, rounded up: 10:25:00 + 4:30 = 10:29:30 → 10:30", () => {
    const held = { ...P, hold: { since: sec("10:13:00") } };
    const resumed = resumeBreak(held, afterH1(), ctx(sec("10:25:00")));
    expect(resumed.hold).toBeUndefined();
    expect(resumed.anchors["i-H2"]).toBe("10:30");
    const c = breakCountdown(resumed, afterH1(), ctx(sec("10:25:00")));
    expect(c).toMatchObject({ state: "counting", startUtc: at("10:30") });
  });

  it("the countdown after Resume is never shorter than what was left", () => {
    const held = { ...P, hold: { since: sec("10:13:00") } };
    const resumed = resumeBreak(held, afterH1(), ctx(sec("10:25:00")));
    const c = breakCountdown(resumed, afterH1(), ctx(sec("10:25:00"))) as { remainingMs: number };
    expect(c.remainingMs).toBeGreaterThanOrEqual(270_000);
    expect(c.remainingMs).toBeLessThan(270_000 + 60_000);
  });

  it("a break paused when it was already due just clears the hold: no pin is invented", () => {
    const held = { ...P, hold: { since: sec("10:19:00") } };
    const resumed = resumeBreak(held, afterH1(), ctx(sec("10:25:00")));
    expect(resumed.hold).toBeUndefined();
    expect(resumed.anchors["i-H2"]).toBeUndefined();
  });

  it("refuses when the plan is not on hold", () => {
    expect(() => resumeBreak(P, afterH1(), ctx(sec("10:25:00")))).toThrow(/not on hold/i);
  });
});

describe("the next heat in the run order, and starting out of order", () => {
  it("is the first heat of the run order that has not started and was not cancelled", () => {
    expect(nextHeatInOrder(P, [heat("H1"), heat("H2"), heat("H3")])?.heatId).toBe("H1");
    expect(nextHeatInOrder(P, afterH1())?.heatId).toBe("H2");
    const heats = [heat("H1", { startedAt: at("10:00"), endedAt: at("10:10") }), heat("H2", { cancelled: true }), heat("H3")];
    expect(nextHeatInOrder(plan(["H1", "H2", "H3"]), heats)?.heatId).toBe("H3");
    expect(nextHeatInOrder(P, [heat("H1", { startedAt: at("10:00") }), heat("H2", { startedAt: at("10:17") }), heat("H3", { startedAt: at("10:34") })])).toBeNull();
  });

  it("starting Heat 2 while Heat 1 is next is out of order and names Heat 1; starting the next heat is not", () => {
    const heats = [heat("H1"), heat("H2"), heat("H3")];
    expect(startsOutOfOrder(P, heats, "H2")).toEqual({ outOfOrder: true, nextHeatId: "H1" });
    expect(startsOutOfOrder(P, heats, "H1")).toEqual({ outOfOrder: false });
  });

  it("with no run order, or a heat nothing is waiting behind, there is nothing to warn about", () => {
    expect(startsOutOfOrder(null, [heat("H1")], "H1")).toEqual({ outOfOrder: false });
    expect(startsOutOfOrder(plan(["H1"]), [heat("H1", { startedAt: at("10:00") })], "H2")).toEqual({ outOfOrder: false });
  });

  it("the timetable re-flows around the real order: Heat 2 started first, Heat 1 then follows it", () => {
    // H2 started 10:00 and ended 10:10; H1 and H3 have not started
    const heats = [heat("H1"), heat("H2", { startedAt: at("10:00"), endedAt: at("10:10") }), heat("H3")];
    const p = plan(["H1", "H2", "H3"], { anchors: {} });
    expect(startOf(p, heats, "H2", at("10:11"))).toBe("10:00");
    expect(startOf(p, heats, "H1", at("10:11"))).toBe("10:17"); // 10:10 + 2 break + 5 warm-up
    expect(startOf(p, heats, "H3", at("10:11"))).toBe("10:34");
    // the countdown now counts to Heat 1, the heat that is next in the run order
    expect(breakCountdown(p, heats, ctx(sec("10:12:00")))).toMatchObject({ heatId: "H1", startUtc: at("10:17"), remainingMs: 300_000 });
  });
});
