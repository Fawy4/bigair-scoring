import { describe, expect, it } from "vitest";
import { pickCurrentHeat } from "./current-heat";
import type { HeatRow } from "./types";

const t = (hhmmss: string) => Date.parse(`2026-10-01T${hhmmss}Z`);
const iso = (hhmmss: string) => new Date(t(hhmmss)).toISOString();
const heat = (id: string, division: string, patch: Partial<HeatRow> = {}): HeatRow => ({
  id, division_id: division, round_id: "r", number: 1, number_suffix: null, name: null, status: "scheduled", duration_sec: 600, warm_up_sec: 0,
  started_at: null, paused_at: null, paused_total_sec: 0, ended_at: null, draw_uid: null, updated_at: iso("09:00:00"), ...patch,
});
const panels = [{ divisionId: "men", seatIds: ["j1", "j2"] }, { divisionId: "women", seatIds: ["j3"] }];
const base = { panels, nowServer: t("10:05:00") };

describe("which heat a phone opens by itself", () => {
  const running = heat("h1", "men", { status: "running", started_at: iso("10:00:00") });
  const other = heat("h2", "women", { status: "running", started_at: iso("10:01:00") });
  it("a spotter follows the running heat", () => {
    expect(pickCurrentHeat({ ...base, heats: [heat("h0", "men"), running], viewer: { role: "spotter", seatId: "s1" } })).toMatchObject({ phase: "running", heat: { id: "h1" } });
  });
  it("a judge follows only a heat of their own panel", () => {
    expect(pickCurrentHeat({ ...base, heats: [running, other], viewer: { role: "judge", seatId: "j3" } }).heat?.id).toBe("h2");
    expect(pickCurrentHeat({ ...base, heats: [running, other], viewer: { role: "judge", seatId: "j9" } }).heat).toBeNull();
  });
  it("a paused heat is followed when nothing is running", () => {
    const paused = heat("h3", "men", { status: "paused", started_at: iso("10:00:00"), paused_at: iso("10:03:00") });
    expect(pickCurrentHeat({ ...base, heats: [paused], viewer: { role: "spotter" } })).toMatchObject({ phase: "paused", heat: { id: "h3" } });
  });
  it("a heat whose time is up is 'ended' even before the database says so; the judge stays on it until they submit", () => {
    const late = heat("h4", "men", { status: "running", started_at: iso("09:50:00") });
    const picked = pickCurrentHeat({ ...base, heats: [late], viewer: { role: "judge", seatId: "j1" } });
    expect(picked).toMatchObject({ phase: "ended", heat: { id: "h4" } });
    expect(pickCurrentHeat({ ...base, heats: [late], viewer: { role: "judge", seatId: "j1" }, submittedHeatIds: new Set(["h4"]) }).heat).toBeNull();
  });
  it("a spotter is not held on an ended heat: between heats they see 'Next'", () => {
    const done = heat("h5", "men", { status: "ended", started_at: iso("09:40:00"), ended_at: iso("09:50:00") });
    expect(pickCurrentHeat({ ...base, heats: [done], viewer: { role: "spotter" } })).toEqual({ heat: null, phase: "none" });
  });
  it("an old unsubmitted heat does not hold a judge for ever", () => {
    const old = heat("h6", "men", { status: "ended", started_at: "2026-09-30T20:00:00.000Z", ended_at: "2026-09-30T20:10:00.000Z" });
    expect(pickCurrentHeat({ ...base, heats: [old], viewer: { role: "judge", seatId: "j1" } }).heat).toBeNull();
  });
  it("a cancelled heat never opens; a pinned heat wins", () => {
    const cancelled = heat("h7", "men", { status: "cancelled", started_at: iso("10:00:00") });
    expect(pickCurrentHeat({ ...base, heats: [cancelled], viewer: { role: "spotter" } }).heat).toBeNull();
    expect(pickCurrentHeat({ ...base, heats: [running, heat("h8", "men")], viewer: { role: "spotter" }, pinnedId: "h8" })).toMatchObject({ heat: { id: "h8" }, phase: "none" });
  });
  it("the head judge and an organiser follow every running heat", () => {
    expect(pickCurrentHeat({ ...base, heats: [other], viewer: { role: "head", seatId: "hj" } }).heat?.id).toBe("h2");
    expect(pickCurrentHeat({ ...base, heats: [other], viewer: { role: "organiser" } }).heat?.id).toBe("h2");
  });
});
