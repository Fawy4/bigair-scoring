import { describe, expect, it } from "vitest";
import { autoStartNotice, heatInPlay, planAfterPublish, planAtRunOrderTime, type PlanInput } from "./auto-start";
import { nextAfterPublish } from "./next-after-publish";
import type { HeatLive } from "@/lib/engine/schedule";
import type { SchedulePlan } from "@/lib/schemas/schedule";
import type { HeatRow } from "./types";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const at = (sec: number) => new Date(NOW + sec * 1000).toISOString();
const heat = (id: string, over: Partial<HeatRow> = {}): HeatRow => ({
  id, division_id: "men", round_id: "r", number: 1, number_suffix: null, name: null, status: "scheduled", duration_sec: 600, warm_up_sec: 0, started_at: null, paused_at: null, paused_total_sec: 0,
  ended_at: null, draw_uid: null, rerun_of: null, public_live: null, reopened_at: null, publish_hold: false, updated_at: at(0), ...over,
});
const published = (id: string, startedSec: number, over: Partial<HeatRow> = {}) => heat(id, { status: "published", started_at: at(startedSec), ended_at: at(startedSec + 600), ...over });

describe("the notice: Next heat sequence starts in 10 s — Stop", () => {
  const waiting = (leftSec: number) => heat("h2", { auto_start_at: at(leftSec), auto_start_mode: "after_publish" });
  it("counts the seconds down from 10, never more", () => {
    expect(autoStartNotice([waiting(10)], NOW)).toMatchObject({ heatId: "h2", mode: "after_publish", secondsLeft: 10, due: false });
    expect(autoStartNotice([waiting(7.2)], NOW)?.secondsLeft).toBe(8);
    expect(autoStartNotice([waiting(11.5)], NOW)?.secondsLeft).toBe(10);
  });
  it("when it has run out the notice says so until the database starts the sequence", () => {
    expect(autoStartNotice([waiting(-0.4)], NOW)).toMatchObject({ secondsLeft: 0, due: true });
  });
  it("there is none for a heat with no notice, an armed heat or a heat that has started", () => {
    expect(autoStartNotice([heat("h2")], NOW)).toBeNull();
    expect(autoStartNotice([heat("h2", { auto_start_at: at(5), auto_start_mode: "run_order", armed_at: at(0), prestart_sec: 60 })], NOW)).toBeNull();
    expect(autoStartNotice([heat("h2", { status: "running", auto_start_at: at(5), auto_start_mode: "run_order" })], NOW)).toBeNull();
  });
});

describe("a heat in play", () => {
  it("running, paused, time up, ended, under review or in its pre-start; not a waiting, published or cancelled heat", () => {
    expect(heatInPlay(heat("a", { status: "running", started_at: at(-60) }), NOW)).toBe(true);
    expect(heatInPlay(heat("a", { status: "running", started_at: at(-700) }), NOW)).toBe(true); // the clock at 0, stored status still running
    expect(heatInPlay(heat("a", { status: "paused", started_at: at(-60), paused_at: at(-10) }), NOW)).toBe(true);
    expect(heatInPlay(heat("a", { status: "ended", started_at: at(-700), ended_at: at(-100) }), NOW)).toBe(true);
    expect(heatInPlay(heat("a", { status: "under_review", started_at: at(-700) }), NOW)).toBe(true);
    expect(heatInPlay(heat("a", { armed_at: at(-5), prestart_sec: 60 }), NOW)).toBe(true);
    expect(heatInPlay(heat("a"), NOW)).toBe(false);
    expect(heatInPlay(published("a", -900), NOW)).toBe(false);
    expect(heatInPlay(heat("a", { status: "cancelled" }), NOW)).toBe(false);
  });
});

describe("after Publish", () => {
  const input = (over: Partial<PlanInput & { publishedId: string }> = {}) => ({ setting: "after_publish" as const, off: false, nextHeatId: "h2", nowServer: NOW, hold: false, publishedId: "h1", heats: [published("h1", -900), heat("h2"), heat("h3")], ...over });
  it("raises the notice for the next heat", () => {
    expect(planAfterPublish(input())).toEqual({ heatId: "h2" });
  });
  it("not when the setting is by hand or at the run order time, when the head judge switched it off, or on Hold", () => {
    expect(planAfterPublish(input({ setting: "manual" }))).toBeNull();
    expect(planAfterPublish(input({ setting: "run_order" }))).toBeNull();
    expect(planAfterPublish(input({ off: true }))).toBeNull();
    expect(planAfterPublish(input({ hold: true }))).toBeNull();
  });
  it("not when there is no next heat, it already has a notice or is armed, or another heat is on the water", () => {
    expect(planAfterPublish(input({ nextHeatId: null }))).toBeNull();
    expect(planAfterPublish(input({ heats: [published("h1", -900), heat("h2", { auto_start_at: at(5), auto_start_mode: "after_publish" })] }))).toBeNull();
    expect(planAfterPublish(input({ heats: [published("h1", -900), heat("h2", { armed_at: at(-1), prestart_sec: 60 })] }))).toBeNull();
    expect(planAfterPublish(input({ heats: [published("h1", -900), heat("h2"), heat("h3", { status: "running", started_at: at(-30) })] }))).toBeNull();
  });
  it("publishing an older heat again (a correction) never starts anything", () => {
    expect(planAfterPublish(input({ publishedId: "h1", heats: [published("h1", -1800), published("h0", -900), heat("h2")] }))).toBeNull();
    expect(planAfterPublish(input({ publishedId: "h0", heats: [published("h1", -1800), published("h0", -900), heat("h2")] }))).toEqual({ heatId: "h2" });
  });
});

describe("at the run order time", () => {
  const input = (over: Partial<Parameters<typeof planAtRunOrderTime>[0]> = {}) => ({
    setting: "run_order" as const, off: false, nextHeatId: "h2", nowServer: NOW, hold: false, heats: [published("h1", -900), heat("h2")],
    startMs: NOW + 70_000, held: false, flagsOn: true, prestartSec: 60, ...over,
  });
  it("waits until the sequence is due within ten seconds (the heat's time less the pre-start)", () => {
    expect(planAtRunOrderTime(input({ startMs: NOW + 90_000 }))).toBeNull(); // the sequence is due in 30 s
    expect(planAtRunOrderTime(input({ startMs: NOW + 70_500 }))).toEqual({ heatId: "h2", heatStartAt: new Date(NOW + 70_500).toISOString() }); // due in 10.5 s
    expect(planAtRunOrderTime(input({ startMs: NOW + 60_000 }))).toEqual({ heatId: "h2", heatStartAt: new Date(NOW + 60_000).toISOString() });
  });
  it("with the flags off there is no pre-start: the sequence is the start itself", () => {
    expect(planAtRunOrderTime(input({ flagsOn: false, startMs: NOW + 30_000 }))).toBeNull();
    expect(planAtRunOrderTime(input({ flagsOn: false, startMs: NOW + 8_000 }))?.heatId).toBe("h2");
  });
  it("a head judge who is late (the time has passed) is asked at once: the database gives the full notice", () => {
    expect(planAtRunOrderTime(input({ startMs: NOW - 120_000 }))?.heatId).toBe("h2");
  });
  it("not by hand or after Publish, switched off, on Hold, held row, no time, no next heat, or another heat on the water", () => {
    expect(planAtRunOrderTime(input({ setting: "manual" }))).toBeNull();
    expect(planAtRunOrderTime(input({ setting: "after_publish" }))).toBeNull();
    expect(planAtRunOrderTime(input({ off: true }))).toBeNull();
    expect(planAtRunOrderTime(input({ hold: true }))).toBeNull();
    expect(planAtRunOrderTime(input({ held: true }))).toBeNull();
    expect(planAtRunOrderTime(input({ startMs: null }))).toBeNull();
    expect(planAtRunOrderTime(input({ nextHeatId: null }))).toBeNull();
    expect(planAtRunOrderTime(input({ heats: [heat("h1", { status: "ended", started_at: at(-700), ended_at: at(-100) }), heat("h2")] }))).toBeNull(); // the heat before it is not published
  });
});

describe("the next heat after Publish", () => {
  const live = (heatId: string, over: Partial<HeatLive> = {}): HeatLive => ({ heatId, division: "d", round: "R1", heat: heatId, startedAt: null, endedAt: null, pausedMin: 0, roundLast: false, durationMin: 10, warmUpMin: 0, cancelled: false, ...over });
  const plan = (ids: string[]): SchedulePlan => ({ items: ids.map((id, i) => ({ id: `i${i}`, kind: "heat" as const, heatId: id })), anchors: {}, actualStarts: {} }) as unknown as SchedulePlan;
  const heats = [published("h1", -900, { division_id: "men" }), heat("h2", { division_id: "men" }), heat("w1", { division_id: "women" })];
  const lives = [live("h1", { startedAt: at(-900), endedAt: at(-300) }), live("h2"), live("w1")];
  it("the first heat of the run order that has not started", () => {
    expect(nextAfterPublish({ plan: plan(["h1", "h2", "w1"]), lives, heats, divisionOrder: ["men", "women"], publishedId: "h1" })).toEqual({ heatId: "h2", divisionId: "men" });
  });
  it("in another division: the console switches to it", () => {
    const l = [live("h1", { startedAt: at(-900), endedAt: at(-300) }), live("h2", { startedAt: at(-200), endedAt: at(-100) }), live("w1")];
    const h = [published("h1", -900), published("h2", -200), heat("w1", { division_id: "women" })];
    expect(nextAfterPublish({ plan: plan(["h1", "h2", "w1"]), lives: l, heats: h, divisionOrder: ["men", "women"], publishedId: "h2" })).toEqual({ heatId: "w1", divisionId: "women" });
  });
  it("after the last heat: none", () => {
    const l = [live("h1", { startedAt: at(-900), endedAt: at(-300) })];
    expect(nextAfterPublish({ plan: plan(["h1"]), lives: l, heats: [published("h1", -900)], divisionOrder: ["men"], publishedId: "h1" })).toBeNull();
  });
  it("a cancelled heat is skipped", () => {
    const l = [live("h1", { startedAt: at(-900), endedAt: at(-300) }), live("h2", { cancelled: true }), live("w1")];
    expect(nextAfterPublish({ plan: plan(["h1", "h2", "w1"]), lives: l, heats, divisionOrder: ["men", "women"], publishedId: "h1" })?.heatId).toBe("w1");
  });
  it("with no run order: the next scheduled heat, division by division, by number", () => {
    expect(nextAfterPublish({ plan: null, lives, heats: [published("h1", -900), heat("w1", { division_id: "women", number: 1 }), heat("h3", { division_id: "men", number: 3 }), heat("h2", { division_id: "men", number: 2 })], divisionOrder: ["men", "women"], publishedId: "h1" })).toEqual({ heatId: "h2", divisionId: "men" });
    expect(nextAfterPublish({ plan: null, lives, heats: [published("h1", -900)], divisionOrder: ["men"], publishedId: "h1" })).toBeNull();
  });
});
