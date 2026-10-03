import { describe, expect, it } from "vitest";
import { DEFAULT_FLAGS, parseFlagSettings } from "@/lib/schemas/flags";
import { cueFor, flagState, hornsFor, overlayArmed, textOn, type FlagHeat } from "./flags";

const T0 = Date.parse("2026-10-03T10:00:00Z");
const s = (n: number) => T0 + n * 1000;
const iso = (n: number) => new Date(s(n)).toISOString();

/** A 10-minute heat, scheduled. */
const base: FlagHeat = { status: "scheduled", durationSec: 600, startedAt: null, pausedAt: null, pausedTotalSec: 0, armedAt: null, prestartSec: null };
/** Armed at T0 with a 60 s pre-start. */
const armed = (pre = 60): FlagHeat => ({ ...base, armedAt: iso(0), prestartSec: pre });
const st = (heat: FlagHeat | null, at: number, extra: { onHold?: boolean; anyHeatStarted?: boolean; settings?: typeof DEFAULT_FLAGS } = {}) =>
  flagState({ settings: extra.settings ?? DEFAULT_FLAGS, heat, nowMs: s(at), onHold: extra.onHold, anyHeatStarted: extra.anyHeatStarted });

describe("flag settings", () => {
  it("are on by default with the owner's colours and lengths", () => {
    expect(DEFAULT_FLAGS.enabled).toBe(true);
    expect(DEFAULT_FLAGS.prestartSec).toBe(60);
    expect(DEFAULT_FLAGS.lastMinuteSec).toBe(60);
    expect(DEFAULT_FLAGS.states.before_start.colour).toBe("#FACC15");
    expect(DEFAULT_FLAGS.states.running.colour).toBe("#15803D");
    expect(DEFAULT_FLAGS.states.last_minute.colour).toBe("#FACC15");
    expect(DEFAULT_FLAGS.states.stopped.colour).toBe("#DC2626");
  });
  it("a damaged value falls back to the defaults, a partial one keeps what was set", () => {
    expect(parseFlagSettings("nonsense")).toEqual(DEFAULT_FLAGS);
    expect(parseFlagSettings(undefined)).toEqual(DEFAULT_FLAGS);
    const p = parseFlagSettings({ prestartSec: 90, states: { running: { colour: "#00ff00" } } });
    expect(p.prestartSec).toBe(90);
    expect(p.states.running).toEqual({ label: "Running", colour: "#00ff00" });
    expect(p.states.stopped.colour).toBe("#DC2626");
  });
});

describe("the state machine, derived from time stamps only", () => {
  it("before the first heat of the day: stopped, 'before the day'", () => {
    expect(st(null, 0)).toMatchObject({ kind: "stopped", why: "before_day", countdownMs: null });
    expect(st(base, 0)).toMatchObject({ kind: "stopped", why: "before_day" });
  });
  it("between heats once one has started", () => {
    expect(st(null, 0, { anyHeatStarted: true })).toMatchObject({ kind: "stopped", why: "between" });
  });
  it("on hold the word is Hold, whatever else is true", () => {
    expect(st(null, 0, { onHold: true, anyHeatStarted: true })).toMatchObject({ kind: "stopped", why: "hold" });
    expect(st(base, 0, { onHold: true })).toMatchObject({ kind: "stopped", why: "hold" });
  });

  it("armed: Before start with the pre-start counting down", () => {
    expect(st(armed(), 0)).toMatchObject({ kind: "before_start", countdownMs: 60_000, startsAtMs: s(60) });
    expect(st(armed(), 30)).toMatchObject({ kind: "before_start", countdownMs: 30_000 });
    expect(st(armed(), 59.5)).toMatchObject({ kind: "before_start", countdownMs: 500 });
  });
  it("at 0:00 of the pre-start the heat is running and its clock starts exactly then", () => {
    const g = st(armed(), 60);
    expect(g).toMatchObject({ kind: "running", countdownMs: 600_000 });
    expect(st(armed(), 90)).toMatchObject({ kind: "running", countdownMs: 570_000 });
    // the heat's start time is the armed moment plus the pre-start, to the millisecond
    expect(overlayArmed(armed(), s(60))).toMatchObject({ status: "running", startedAt: iso(60) });
    expect(overlayArmed(armed(), s(59.999)).status).toBe("scheduled");
  });
  it("'Start now' skips the yellow: a heat started at once is green", () => {
    const started: FlagHeat = { ...armed(), status: "running", startedAt: iso(20) };
    expect(st(started, 20)).toMatchObject({ kind: "running", countdownMs: 600_000 });
    expect(st(started, 35)).toMatchObject({ kind: "running", countdownMs: 585_000 });
  });
  it("abort: armed back to nothing is red again, the heat not started", () => {
    expect(st(armed(), 20)).toMatchObject({ kind: "before_start" });
    const aborted: FlagHeat = { ...base, armedAt: null, prestartSec: null };
    expect(st(aborted, 20, { anyHeatStarted: true })).toMatchObject({ kind: "stopped", why: "between" });
    expect(overlayArmed(aborted, s(500))).toEqual(aborted);
  });

  const running = (at = 0): FlagHeat => ({ ...base, status: "running", startedAt: iso(at) });
  it("Last minute starts when the remaining time reaches the last-minute length", () => {
    expect(st(running(), 539)).toMatchObject({ kind: "running", countdownMs: 61_000 });
    expect(st(running(), 540)).toMatchObject({ kind: "last_minute", countdownMs: 60_000 });
    expect(st(running(), 599)).toMatchObject({ kind: "last_minute", countdownMs: 1_000 });
  });
  it("at 0:00 the flag goes red 'Finished' even before End heat is pressed", () => {
    expect(st(running(), 600)).toMatchObject({ kind: "stopped", why: "finished", countdownMs: null });
    expect(st(running(), 600, { onHold: true })).toMatchObject({ kind: "stopped", why: "hold" });
    expect(st(running(), 700)).toMatchObject({ kind: "stopped", why: "finished" });
  });
  it("after End heat (ended, under review, published) it stays red 'Finished'", () => {
    for (const status of ["ended", "under_review", "published"]) {
      expect(st({ ...running(), status }, 100)).toMatchObject({ kind: "stopped", why: "finished" });
    }
  });
  it("pause is red 'Paused' and shows the time left; the clock does not run", () => {
    const paused: FlagHeat = { ...running(), status: "paused", pausedAt: iso(100) };
    expect(st(paused, 100)).toMatchObject({ kind: "stopped", why: "paused", countdownMs: 500_000 });
    expect(st(paused, 400)).toMatchObject({ kind: "stopped", why: "paused", countdownMs: 500_000 });
  });
  it("resume goes back to Running or Last minute according to the time left", () => {
    // paused at 100 s for 200 s, resumed at 300 s → 500 s left
    const resumed: FlagHeat = { ...running(), pausedTotalSec: 200 };
    expect(st(resumed, 300)).toMatchObject({ kind: "running", countdownMs: 500_000 });
  });
  it("pause and resume inside the last minute", () => {
    const paused: FlagHeat = { ...running(), status: "paused", pausedAt: iso(570) };
    expect(st(paused, 570)).toMatchObject({ kind: "stopped", why: "paused", countdownMs: 30_000 });
    expect(st(paused, 900)).toMatchObject({ kind: "stopped", why: "paused", countdownMs: 30_000 });
    const resumed: FlagHeat = { ...running(), pausedTotalSec: 330 }; // resumed at 900 s
    expect(st(resumed, 900)).toMatchObject({ kind: "last_minute", countdownMs: 30_000 });
    expect(st(resumed, 930)).toMatchObject({ kind: "stopped", why: "finished" });
  });
  it("a resume with 20 seconds left is Last minute, and finishes 20 s later", () => {
    const resumed: FlagHeat = { ...running(), pausedTotalSec: 100 }; // 600 s heat, 100 s paused; resumed at 680 s → 20 s left
    expect(st(resumed, 680)).toMatchObject({ kind: "last_minute", countdownMs: 20_000 });
    expect(st(resumed, 700)).toMatchObject({ kind: "stopped", why: "finished" });
  });
  it("a heat shorter than the last-minute length is Last minute from the green", () => {
    const short: FlagHeat = { ...running(), durationSec: 45 };
    expect(st(short, 0)).toMatchObject({ kind: "last_minute", countdownMs: 45_000 });
  });
  it("cancelled is red 'between'", () => {
    expect(st({ ...base, status: "cancelled" }, 0, { anyHeatStarted: true })).toMatchObject({ kind: "stopped", why: "between" });
  });

  it("flags off: nothing is derived (kind is null)", () => {
    expect(st(armed(), 10, { settings: { ...DEFAULT_FLAGS, enabled: false } })).toBeNull();
  });
  it("a custom pre-start and last-minute length move the transitions", () => {
    const settings = { ...DEFAULT_FLAGS, lastMinuteSec: 30 };
    expect(st(running(), 569, { settings })?.kind).toBe("running");
    expect(st(running(), 570, { settings })?.kind).toBe("last_minute");
    expect(st(armed(120), 119)).toMatchObject({ kind: "before_start", countdownMs: 1_000 });
    expect(st(armed(120), 120)).toMatchObject({ kind: "running" });
  });
  it("the same time stamps always give the same state (a reload at any moment)", () => {
    const heat = armed();
    for (let t = -5; t < 700; t += 7.3) {
      const a = st(heat, t);
      const b = st(JSON.parse(JSON.stringify(heat)), t);
      expect(b).toEqual(a);
    }
  });
  it("the label and colour come from the event's settings", () => {
    const settings = parseFlagSettings({ states: { before_start: { label: "Get ready", colour: "#ffff00" } } });
    expect(st(armed(), 1, { settings })).toMatchObject({ label: "Get ready", colour: "#ffff00" });
    expect(st(armed(), 61, { settings })).toMatchObject({ label: "Running", colour: "#15803D" });
  });
  it("the stopped words say which: Finished, Paused, Hold", () => {
    expect(st(running(), 700)?.label).toBe("Finished");
    expect(st({ ...running(), status: "paused", pausedAt: iso(5) }, 9)?.label).toBe("Paused");
    expect(st(null, 0, { onHold: true })?.label).toBe("Hold");
    expect(st(null, 0)?.label).toBe("Stopped");
  });
});

describe("a frozen pre-start and the simulator's speed", () => {
  const frozen = (at: number, pre = 60): FlagHeat => ({ ...armed(pre), armedPausedAt: iso(at) });
  it("a frozen yellow is red Paused and keeps the time that was left", () => {
    expect(st(frozen(20), 20)).toMatchObject({ kind: "stopped", why: "paused", countdownMs: 40_000, inPrestart: true });
    expect(st(frozen(20), 500)).toMatchObject({ kind: "stopped", why: "paused", countdownMs: 40_000, inPrestart: true });
  });
  it("a frozen yellow does not start the heat when its old start time passes", () => {
    expect(overlayArmed(frozen(20), s(120)).status).toBe("scheduled");
  });
  it("after Resume the start moves later by the frozen time (the database shifts armed_at)", () => {
    const resumed: FlagHeat = { ...armed(), armedAt: iso(30) }; // frozen 30 s ago, now 60 s from new arming
    expect(st(resumed, 50)).toMatchObject({ kind: "before_start", countdownMs: 40_000 });
  });
  it("Resume into the yellow gives no horn and the cue says it carries on", () => {
    const prev = st(frozen(20), 20);
    const next = st({ ...armed(), armedAt: iso(30) }, 30);
    expect(hornsFor(prev, next)).toBe(0);
    expect(cueFor(prev, next, "Heat 1")).toMatch(/carries on/);
  });
  it("a freeze during the yellow is announced as paused, not aborted", () => {
    const prev = st(armed(), 20);
    const next = st(frozen(20), 20);
    expect(cueFor(prev, next, "Heat 1")).toMatch(/paused/);
  });
  it("the last minute is as short as the speed: at x10 a minute is 6 s", () => {
    // a 10-minute heat at x10 is stored as 60 s
    const run = (timeScale: number): FlagHeat => ({ ...base, status: "running", durationSec: 600 / timeScale, startedAt: iso(0), timeScale });
    expect(st(run(10), 53)?.kind).toBe("running");
    expect(st(run(10), 55)?.kind).toBe("last_minute");
    expect(st(run(1), 535)?.kind).toBe("running");
    expect(st(run(1), 545)?.kind).toBe("last_minute");
  });
});

describe("the horns", () => {
  const kinds = (a: FlagHeat | null, t0: number, t1: number) => hornsFor(st(a, t0), st(a, t1));
  const running: FlagHeat = { ...base, status: "running", startedAt: iso(0) };
  it("nothing after a reload (no previous reading)", () => {
    expect(hornsFor(null, st(running, 100))).toBe(0);
  });
  it("one at green, one at the last minute, two at red", () => {
    expect(hornsFor(st(armed(), 59), st(armed(), 60))).toBe(1);
    expect(kinds(running, 539, 540)).toBe(1);
    expect(kinds(running, 599, 600)).toBe(2);
  });
  it("one at resume, none at the pause and none for a plain tick", () => {
    const paused: FlagHeat = { ...running, status: "paused", pausedAt: iso(100) };
    const resumed: FlagHeat = { ...running, pausedTotalSec: 50 };
    expect(hornsFor(st(running, 99), st(paused, 100))).toBe(0);
    expect(hornsFor(st(paused, 120), st(resumed, 150))).toBe(1);
    expect(kinds(running, 10, 11)).toBe(0);
  });
  it("abort back to red sounds nothing; the finish after a pause sounds two", () => {
    expect(hornsFor(st(armed(), 20), st(null, 21, { anyHeatStarted: true }))).toBe(0);
    const pausedLast: FlagHeat = { ...running, status: "paused", pausedAt: iso(570) };
    expect(hornsFor(st(pausedLast, 600), st({ ...pausedLast, status: "ended" }, 601))).toBe(0);
  });
  it("a long freeze that jumps over green and the last minute gives one horn; over the finish gives two", () => {
    expect(hornsFor(st(armed(), 30), st(armed(), 560))).toBe(1);
    expect(hornsFor(st(armed(), 30), st(armed(), 700))).toBe(2);
  });
  it("flags off: no horns", () => {
    expect(hornsFor(null, null)).toBe(0);
  });
});

describe("the text cue for each change (announcer)", () => {
  it("names the colour and the heat", () => {
    const heat: FlagHeat = armed();
    expect(cueFor(st(null, 0), st(heat, 1), "Heat 5")).toBe("Yellow — one minute to the start of Heat 5");
    expect(cueFor(st(heat, 59), st(heat, 60), "Heat 5")).toBe("Green — Heat 5 is running");
    const run: FlagHeat = { ...base, status: "running", startedAt: iso(0) };
    expect(cueFor(st(run, 539), st(run, 540), "Heat 5")).toBe("Yellow — last minute of Heat 5");
    expect(cueFor(st(run, 599), st(run, 600), "Heat 5")).toBe("Red — Heat 5 finished");
    const paused: FlagHeat = { ...run, status: "paused", pausedAt: iso(100) };
    expect(cueFor(st(run, 99), st(paused, 100), "Heat 5")).toBe("Red — Heat 5 paused");
    expect(cueFor(st(paused, 110), st({ ...run, pausedTotalSec: 20 }, 120), "Heat 5")).toBe("Green — Heat 5 resumed");
    expect(cueFor(st(armed(), 20), st(null, 21, { anyHeatStarted: true }), "Heat 5")).toBe("Red — the start of Heat 5 is aborted");
  });
  it("no cue when nothing changed", () => {
    const run: FlagHeat = { ...base, status: "running", startedAt: iso(0) };
    expect(cueFor(st(run, 10), st(run, 11), "Heat 5")).toBeNull();
    expect(cueFor(null, st(run, 11), "Heat 5")).toBeNull();
  });
  it("a longer pre-start is said in words", () => {
    expect(cueFor(st(null, 0), st(armed(120), 1), "Heat 5")).toBe("Yellow — 2 minutes to the start of Heat 5");
    expect(cueFor(st(null, 0), st(armed(30), 1), "Heat 5")).toBe("Yellow — 30 seconds to the start of Heat 5");
  });
});

describe("text colour", () => {
  it("black on yellow, white on green and red", () => {
    expect(textOn("#FACC15")).toBe("#000000");
    expect(textOn("#15803D")).toBe("#FFFFFF");
    expect(textOn("#DC2626")).toBe("#FFFFFF");
  });
});

import { anyHeatStarted, flagHeatOf, isArmedNow, pickFlagHeat } from "./flags";

describe("which heat the strip is about", () => {
  const row = (id: string, over: object = {}) => ({ id, status: "scheduled", duration_sec: 600, started_at: null, paused_at: null, paused_total_sec: 0, armed_at: null, prestart_sec: null, ...over });
  it("the heat in its pre-start wins over the heat the screen is on", () => {
    const a = row("a", { status: "ended", started_at: iso(-900) });
    const b = row("b", { armed_at: iso(0), prestart_sec: 60 });
    expect(pickFlagHeat([a, b], a, s(10))?.id).toBe("b");
    expect(pickFlagHeat([a, b], a, s(60))?.id).toBe("a"); // green: the screen's own rule takes over (the heat is running now)
  });
  it("nothing armed: the screen's own heat", () => {
    const a = row("a");
    expect(pickFlagHeat([a], a, s(0))?.id).toBe("a");
    expect(pickFlagHeat([a], null, s(0))).toBeNull();
  });
  it("isArmedNow is true only inside the pre-start", () => {
    const b = row("b", { armed_at: iso(0), prestart_sec: 60 });
    expect(isArmedNow(b, s(-1))).toBe(true);
    expect(isArmedNow(b, s(59))).toBe(true);
    expect(isArmedNow(b, s(60))).toBe(false);
    expect(isArmedNow(row("c"), s(0))).toBe(false);
  });
  it("a heat row turns into the flag input unchanged", () => {
    expect(flagHeatOf(row("b", { armed_at: iso(0), prestart_sec: 60 }))).toEqual({ ...armed(), status: "scheduled", armedPausedAt: null, timeScale: 1 });
  });
  it("a heat has started once one has a start time, or its pre-start is over", () => {
    expect(anyHeatStarted([row("a")], s(0))).toBe(false);
    expect(anyHeatStarted([row("a", { started_at: iso(-5) })], s(0))).toBe(true);
    expect(anyHeatStarted([row("a", { armed_at: iso(0), prestart_sec: 60 })], s(30))).toBe(false);
    expect(anyHeatStarted([row("a", { armed_at: iso(0), prestart_sec: 60 })], s(61))).toBe(true);
  });
});
