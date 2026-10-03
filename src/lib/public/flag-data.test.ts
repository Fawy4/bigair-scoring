import { describe, expect, it } from "vitest";
import { parseFlagSettings } from "@/lib/schemas/flags";
import { pickPublicFlagHeat, publicFlagAt, publicFlagData } from "./flag-data";
import type { PublicTimetableModel } from "./timetable";
import type { PublicTimetable, TimetableHeat } from "./types";

const NOW = Date.parse("2026-10-03T10:00:00Z");
const iso = (s: number) => new Date(NOW + s * 1000).toISOString();
const heat = (id: string, over: Partial<TimetableHeat> = {}): TimetableHeat => ({
  id, division_id: "d", round_id: "r", number: Number(id.slice(1)), suffix: null, name: null, status: "scheduled", effective_status: "scheduled", held: false, started_at: null, ended_at: null,
  paused_at: null, paused_total_sec: 0, duration_sec: 600, warm_up_sec: 0, rerun_of: null, round_last: false, break_after_heat_min: null, break_after_round_min: null, armed_at: null, prestart_sec: null, ...over,
});
const table = (heats: TimetableHeat[], flags: unknown = undefined): PublicTimetable => ({ allowed: true, server_now: iso(0), timezone: "Africa/Cairo", poll_sec: 7, ready_call_min: 15, flags, plans: [], divisions: [], rounds: [], heats });
const tt = (over: Partial<PublicTimetableModel> = {}): PublicTimetableModel => ({ day: null, isToday: true, rows: [], now: null, upNext: [], finish: null, onHold: false, heatsLeft: 0, ...over });

describe("public flag data", () => {
  it("the heat in its pre-start comes first, then the one on the water, then the one that started last", () => {
    const done = heat("h1", { status: "ended", effective_status: "ended", started_at: iso(-900) });
    const armed = heat("h2", { armed_at: iso(-10), prestart_sec: 60 });
    expect(pickPublicFlagHeat([done, armed], NOW)?.id).toBe("h2");
    const running = heat("h3", { status: "running", effective_status: "running", started_at: iso(-30) });
    expect(pickPublicFlagHeat([done, running], NOW)?.id).toBe("h3");
    expect(pickPublicFlagHeat([done, heat("h4")], NOW)?.id).toBe("h1");
    expect(pickPublicFlagHeat([heat("h4")], NOW)).toBeNull();
  });
  it("null when the event has flags off or there is no timetable", () => {
    expect(publicFlagData(null, tt(), undefined)).toBeNull();
    expect(publicFlagData(table([heat("h1")], { enabled: false }), tt(), { enabled: false })).toBeNull();
  });
  it("on by default when the event never chose", () => {
    expect(publicFlagData(table([heat("h1")]), tt(), undefined)?.settings.enabled).toBe(true);
  });
  it("yellow with the countdown, then green, then yellow, then red, all from the time stamps", () => {
    const armed = heat("h1", { armed_at: iso(0), prestart_sec: 60 });
    const d = publicFlagData(table([armed]), tt(), parseFlagSettings({}))!;
    expect(publicFlagAt(d, NOW + 10_000)?.state).toMatchObject({ kind: "before_start", countdownMs: 50_000 });
    expect(publicFlagAt(d, NOW + 61_000)?.state).toMatchObject({ kind: "running" });
    expect(publicFlagAt(d, NOW + 60_000 + 541_000)?.state).toMatchObject({ kind: "last_minute" });
    expect(publicFlagAt(d, NOW + 60_000 + 601_000)?.state).toMatchObject({ kind: "stopped", why: "finished" });
  });
  it("the red flag says what comes next", () => {
    const done = heat("h1", { status: "ended", effective_status: "ended", started_at: iso(-900) });
    const d = publicFlagData(table([done]), tt({ upNext: [{ title: "Heat 5", start: "10:40" } as never] }), undefined)!;
    expect(publicFlagAt(d, NOW)?.words).toBe("Finished — next: Heat 5, est. 10:40");
    const hold = publicFlagData(table([done]), tt({ onHold: true }), undefined)!;
    expect(publicFlagAt(hold, NOW)?.words).toBe("Hold — times update when we resume");
  });
});
