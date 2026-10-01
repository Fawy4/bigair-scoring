import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScheduleDay, ScheduleError } from "./schedule";

const load = () => JSON.parse(readFileSync(join(process.cwd(), "presets", "schedule", "kitemania-day2.json"), "utf8"));

describe("Schedule schema", () => {
  it("parses kitemania-day2.json (three plans, one active)", () => {
    const day = parseScheduleDay(load());
    expect(day.timezone).toBe("Africa/Cairo");
    expect(day.plans.map((p) => p.id)).toEqual(["main", "plan-a-bad-wind", "plan-a-good-wind"]);
    expect(day.plans.filter((p) => p.active)).toHaveLength(1);
    expect(day.defaults).toEqual({ breakAfterHeatMin: 3, breakAfterRoundMin: 5 }); // the ready call is the event's one setting, not part of a run order
  });

  it("rejects two active plans", () => {
    const j = load();
    j.plans[1].active = true;
    expect(() => parseScheduleDay(j)).toThrow(/exactly one plan must be active \(found 2\)/);
  });

  it("rejects no active plan", () => {
    const j = load();
    j.plans[0].active = false;
    expect(() => parseScheduleDay(j)).toThrow(/exactly one plan must be active \(found 0\)/);
  });

  it("rejects a bad HH:MM", () => {
    for (const bad of ["25:00", "9:30", "10:60", "noon"]) {
      const j = load();
      j.plans[0].anchors["w-r1-h1"] = bad;
      expect(() => parseScheduleDay(j)).toThrow(ScheduleError);
    }
  });

  it("rejects an anchor on an unknown item", () => {
    const j = load();
    j.plans[0].anchors["ghost"] = "12:00";
    expect(() => parseScheduleDay(j)).toThrow(/anchor on unknown item "ghost"/);
  });

  it("rejects an actual start on a heat item (heat actuals come from the heats)", () => {
    const j = load();
    j.plans[0].actualStarts["w-r1-h1"] = "2026-10-03T07:30:00Z";
    expect(() => parseScheduleDay(j)).toThrow(/comes from the heat/);
  });

  it("accepts an actual start on a break item", () => {
    const j = load();
    j.plans[0].items.splice(4, 0, { id: "lunch", kind: "break", label: "Lunch", durationMin: 60 });
    j.plans[0].actualStarts["lunch"] = "2026-10-03T08:30:00Z";
    expect(() => parseScheduleDay(j)).not.toThrow();
  });

  it("rejects duplicate item ids and an unknown time zone", () => {
    const dup = load();
    dup.plans[0].items[1].id = "w-r1-h1";
    expect(() => parseScheduleDay(dup)).toThrow(/duplicate item id/);
    const tz = load();
    tz.timezone = "Mars/Olympus";
    expect(() => parseScheduleDay(tz)).toThrow(/time zone/);
  });

  it("rejects a heat item with neither heatId nor heatRef", () => {
    const j = load();
    delete j.plans[0].items[0].heatRef;
    expect(() => parseScheduleDay(j)).toThrow(/heatId or heatRef/);
  });
});
