import { describe, expect, it } from "vitest";
import { chooseDivision, divisionStorageKey, heatsOfDivision, heatToShow, isLiveHeat, liveDivisionIds, rememberedDivision } from "./division-pick";
import type { HeatRow } from "./types";

// Console v2 §1: one division at a time, remembered per device; default = the division with a running heat, else the next heat's.
const NOW = Date.parse("2026-10-03T08:00:00Z");
const heat = (id: string, division: string, status = "scheduled", extra: Partial<HeatRow> = {}): HeatRow => ({
  id, division_id: division, round_id: "r", number: 1, number_suffix: null, name: null, status, duration_sec: 600, warm_up_sec: 0, started_at: null, paused_at: null, paused_total_sec: 0,
  ended_at: null, draw_uid: null, rerun_of: null, public_live: null, reopened_at: null, publish_hold: false, updated_at: "", ...extra,
});
const running = (id: string, division: string, ago = 120) => heat(id, division, "running", { started_at: new Date(NOW - ago * 1000).toISOString() });
const divisions = [{ id: "men", name: "Pro Men" }, { id: "women", name: "Pro Women" }, { id: "youth", name: "Youth" }];

describe("the division filter", () => {
  it("keeps only the heats of the division picked", () => {
    const heats = [heat("a", "men"), heat("b", "women"), heat("c", "men")];
    expect(heatsOfDivision(heats, "men").map((h) => h.id)).toEqual(["a", "c"]);
    expect(heatsOfDivision(heats, "women").map((h) => h.id)).toEqual(["b"]);
    expect(heatsOfDivision(heats, null)).toEqual([]);
  });
});

describe("which division opens", () => {
  const base = { divisions, nowServer: NOW };
  it("a choice remembered on this device wins", () => {
    expect(chooseDivision({ ...base, heats: [running("a", "men")], nextHeatDivisionId: "youth", remembered: "women" })).toBe("women");
  });
  it("without one: the division with a running heat", () => {
    expect(chooseDivision({ ...base, heats: [heat("a", "men"), running("b", "women")], nextHeatDivisionId: "men", remembered: null })).toBe("women");
  });
  it("a paused heat counts as running; a heat whose time is up does not", () => {
    expect(chooseDivision({ ...base, heats: [heat("p", "youth", "paused", { started_at: new Date(NOW - 60_000).toISOString(), paused_at: new Date(NOW - 30_000).toISOString() })], nextHeatDivisionId: "men", remembered: null })).toBe("youth");
    expect(isLiveHeat(running("late", "men", 700), NOW)).toBe(false);
    expect(chooseDivision({ ...base, heats: [running("late", "men", 700)], nextHeatDivisionId: "women", remembered: null })).toBe("women");
  });
  it("else the division of the next heat of the run order, else the first division", () => {
    expect(chooseDivision({ ...base, heats: [heat("a", "men")], nextHeatDivisionId: "youth", remembered: null })).toBe("youth");
    expect(chooseDivision({ ...base, heats: [], nextHeatDivisionId: null, remembered: null })).toBe("men");
  });
  it("a remembered division that is gone is ignored; no divisions gives nothing", () => {
    expect(chooseDivision({ ...base, heats: [], nextHeatDivisionId: null, remembered: "deleted" })).toBe("men");
    expect(chooseDivision({ divisions: [], heats: [], nextHeatDivisionId: null, remembered: null, nowServer: NOW })).toBeNull();
  });
});

describe("the live dot", () => {
  it("is on for every division with a heat running or paused, and only those", () => {
    const heats = [heat("a", "men", "ended"), running("b", "women"), heat("c", "youth", "paused", { started_at: new Date(NOW - 60_000).toISOString() })];
    expect([...liveDivisionIds(heats, NOW)].sort()).toEqual(["women", "youth"]);
  });
});

describe("the heat shown for a division", () => {
  const heats = [heat("m1", "men", "ended"), heat("m2", "men"), running("w1", "women"), heat("w2", "women")];
  it("the one picked, if it is in this division", () => {
    expect(heatToShow({ heats, divisionId: "men", pickedId: "m1", nextHeatId: "m2", nowServer: NOW })).toBe("m1");
    expect(heatToShow({ heats, divisionId: "men", pickedId: "w2", nextHeatId: "m2", nowServer: NOW })).toBe("m2"); // a pick from another division is ignored
  });
  it("else the running heat of the division, else the next heat if it is in the division, else the first not started", () => {
    expect(heatToShow({ heats, divisionId: "women", pickedId: null, nextHeatId: "m2", nowServer: NOW })).toBe("w1");
    expect(heatToShow({ heats, divisionId: "men", pickedId: null, nextHeatId: "m2", nowServer: NOW })).toBe("m2");
    expect(heatToShow({ heats, divisionId: "men", pickedId: null, nextHeatId: null, nowServer: NOW })).toBe("m2");
    expect(heatToShow({ heats: [heat("x", "youth", "ended")], divisionId: "youth", pickedId: null, nextHeatId: null, nowServer: NOW })).toBe("x");
    expect(heatToShow({ heats, divisionId: null, pickedId: null, nextHeatId: null, nowServer: NOW })).toBeNull();
  });
});

describe("remembered on this device", () => {
  const store = (init: Record<string, string> = {}) => {
    const data = { ...init };
    return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), data };
  };
  it("one key per event; write then read gives the division back", () => {
    const s = store();
    rememberedDivision.write("ev1", "women", s);
    expect(s.data[divisionStorageKey("ev1")]).toBe("women");
    expect(rememberedDivision.read("ev1", s)).toBe("women");
    expect(rememberedDivision.read("ev2", s)).toBeNull();
  });
  it("blocked storage is 'nothing remembered', never an error", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(rememberedDivision.read("ev1", broken)).toBeNull();
    expect(() => rememberedDivision.write("ev1", "men", broken)).not.toThrow();
    expect(rememberedDivision.read("ev1", null)).toBeNull();
  });
});
