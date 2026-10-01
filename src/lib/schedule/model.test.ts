import { describe, expect, it } from "vitest";
import { buildHeatModel, type HeatRowDb } from "./model";

const heat = (over: Partial<HeatRowDb>): HeatRowDb => ({ id: "h", division_id: "d1", round_id: "r1", draw_uid: null, number: 1, name: null, status: "scheduled", started_at: null, ended_at: null, duration_sec: 600, warm_up_sec: 300, paused_total_sec: 0, ...over });
const divisions = [{ id: "d1", name: "Pro Men", sort_order: 1, draw: null }, { id: "d2", name: "Women", sort_order: 2, draw: null }];
const rounds = [
  { id: "r1", division_id: "d1", name: "Round 1", short_name: "R1", sort_order: 1 },
  { id: "r2", division_id: "d1", name: "Final", short_name: "F", sort_order: 2 },
  { id: "r3", division_id: "d2", name: "Round 1", short_name: "R1", sort_order: 1 },
];

describe("the heat list of the run order screen", () => {
  it("lists heats by division order, then round, then number, with length and warm-up in minutes", () => {
    const m = buildHeatModel(divisions, rounds, [heat({ id: "c", division_id: "d2", round_id: "r3", number: 3 }), heat({ id: "b", round_id: "r2", number: 2 }), heat({ id: "a", number: 1 })]);
    expect(m.infos.map((h) => [h.heatId, h.division, h.round, h.heat, h.durationMin, h.warmUpMin])).toEqual([
      ["a", "Pro Men", "Round 1", "Heat 1", 10, 5],
      ["b", "Pro Men", "Final", "Heat 2", 10, 5],
      ["c", "Women", "Round 1", "Heat 3", 10, 5],
    ]);
  });

  it("the organiser's name for a heat wins; the last heat of a round is marked for the round-end break", () => {
    const m = buildHeatModel(divisions, rounds, [heat({ id: "a", number: 1 }), heat({ id: "b", number: 2, name: "Semi A" })]);
    expect(m.infos[1].heat).toBe("Semi A");
    expect(m.lives.map((l) => l.roundLast)).toEqual([false, true]);
  });

  it("server times come from the heat rows, paused time in minutes", () => {
    const m = buildHeatModel(divisions, rounds, [heat({ id: "a", status: "running", started_at: "2026-10-03T07:00:00Z", paused_total_sec: 120 })]);
    expect(m.lives[0]).toMatchObject({ startedAt: "2026-10-03T07:00:00Z", endedAt: null, pausedMin: 2 });
  });

  it("break defaults of the heat's round come from the stored draw", () => {
    const draw = { rounds: [{ id: "R1", heats: [{ id: "R1-H1", uid: "u1", roundLast: true, breakAfterHeatMin: 2, breakAfterRoundMin: 7 }] }] };
    const m = buildHeatModel([{ ...divisions[0], draw }], rounds, [heat({ id: "a", draw_uid: "u1" })]);
    expect(m.lives[0]).toMatchObject({ breakAfterHeatMin: 2, breakAfterRoundMin: 7, roundLast: true });
  });
});
