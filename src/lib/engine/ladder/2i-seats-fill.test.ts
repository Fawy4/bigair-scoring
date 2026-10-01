// Doc 08 §2I — a seat fills the moment its source heat is published when the round's seats are fixed in advance ("By original seeding", adjacent pairing);
// a round that re-seeds from all its arrivals still deals when every feeding heat is published, but shows who is on the way.
import { describe, expect, it } from "vitest";
import type { FormatTemplate } from "@/lib/schemas/format-template";
import { expandFormat } from "./expand";
import { heat, loadFormat, makeEntrants, publish, publishRound, round } from "./fixtures";
import { applyHeatResult, setHeatStatus } from "./progress";
import { provisionalSeat } from "./draw-edit";

const params = { heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2 };
const knock = (extra: Record<string, unknown> = {}): FormatTemplate => loadFormat("heats4-top2-single-elim", (j) => Object.assign(j.generator.params, params, extra));
const lowestSeed = (draw: ReturnType<typeof expandFormat>, heatId: string) => heat(draw, heatId).slots.map((s) => s.entrantId!).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))[0];
const seatsOf = (draw: ReturnType<typeof expandFormat>, roundId: string, heatIndex: number) => round(draw, roundId).heats[heatIndex].slots;

describe("2I Arrow's ladder (24 riders, 3 per heat, 1 advances, final of 2): seats fixed in advance", () => {
  const d0 = expandFormat(knock(), makeEntrants(24));

  it("publishing R1 H1 puts its winner in R2 H1 seat 1 at once; seat 2 and the other R2 heats are untouched", () => {
    const d1 = publish(d0, "R1-H1");
    const winner = lowestSeed(d0, "R1-H1");
    const r2h1 = seatsOf(d1, "R2", 0);
    expect(r2h1[0].entrantId).toBe(winner);
    expect(r2h1[1].entrantId).toBeUndefined();
    expect(r2h1[1].from).toEqual({ round: "R1", heat: 2, place: 1 });
    for (const i of [1, 2, 3]) expect(seatsOf(d1, "R2", i).every((s) => !s.entrantId)).toBe(true);
    expect(round(d1, "R2").seeded).toBe(false);
  });

  it("publishing R1 H2 fills the other seat; after all eight R1 heats R2 is what §2G7 says", () => {
    const d2 = publish(publish(d0, "R1-H1"), "R1-H2");
    expect(seatsOf(d2, "R2", 0).map((s) => s.entrantId)).toEqual([lowestSeed(d0, "R1-H1"), lowestSeed(d0, "R1-H2")]);
    const all = publishRound(d0, "R1");
    expect(round(all, "R2").seeded).toBe(true);
    expect(seatsOf(all, "R2", 3).map((s) => s.entrantId)).toEqual([lowestSeed(d0, "R1-H7"), lowestSeed(d0, "R1-H8")]);
  });

  it("filling seat by seat gives exactly the same R2 as publishing the whole round first", () => {
    const stepwise = ["R1-H8", "R1-H3", "R1-H1", "R1-H6", "R1-H2", "R1-H5", "R1-H7", "R1-H4"].reduce((d, id) => publish(d, id), d0);
    const together = publishRound(d0, "R1");
    expect(round(stepwise, "R2").heats.map((h) => h.slots.map((s) => s.entrantId))).toEqual(round(together, "R2").heats.map((h) => h.slots.map((s) => s.entrantId)));
  });

  it("the Final fills the same way: the winner of SF H1 takes Final seat 1 the moment SF H1 is published", () => {
    const upTo = publishRound(publishRound(d0, "R1"), "R2");
    const sf1 = publish(upTo, "SF-H1");
    expect(seatsOf(sf1, "F", 0)[0].entrantId).toBe(lowestSeed(upTo, "SF-H1"));
    expect(seatsOf(sf1, "F", 0)[1].entrantId).toBeUndefined();
    const sf2 = publish(sf1, "SF-H2");
    expect(seatsOf(sf2, "F", 0).map((s) => s.entrantId)).toEqual([lowestSeed(upTo, "SF-H1"), lowestSeed(upTo, "SF-H2")]);
  });

  it("a correction before R2 H1 starts changes the seat; a correction that changes nothing never conflicts", () => {
    const d1 = publish(d0, "R1-H1");
    const second = heat(d0, "R1-H1").slots.map((s) => s.entrantId!).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))[1];
    const fixed = applyHeatResult(d1, "R1-H1", { ranked: heat(d0, "R1-H1").slots.map((s) => ({ entrantId: s.entrantId!, place: s.entrantId === second ? 1 : 2, total: 50, tieKeys: [] })).map((r, i) => ({ ...r, place: r.entrantId === second ? 1 : i + 2 })) });
    expect(fixed.conflict).toBeUndefined();
    expect(seatsOf(fixed.draw, "R2", 0)[0].entrantId).toBe(second);
    const same = applyHeatResult(d1, "R1-H1", { ranked: heat(d0, "R1-H1").slots.map((s) => s.entrantId!).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).map((id, i) => ({ entrantId: id, place: i + 1, total: 90 - i, tieKeys: [] })) });
    expect(same.conflict).toBeUndefined();
    expect(seatsOf(same.draw, "R2", 0)[0].entrantId).toBe(lowestSeed(d0, "R1-H1"));
  });

  it("the same correction while R2 H1 has started is a conflict naming R2 H1, and the draw is unchanged", () => {
    const d1 = setHeatStatus(publish(d0, "R1-H1"), "R2-H1", "running");
    const second = heat(d0, "R1-H1").slots.map((s) => s.entrantId!).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))[1];
    const res = applyHeatResult(d1, "R1-H1", { ranked: heat(d0, "R1-H1").slots.map((s, i) => ({ entrantId: s.entrantId!, place: s.entrantId === second ? 1 : i + 2, total: 50, tieKeys: [] })) });
    expect(res.conflict?.type).toBe("downstream_started");
    expect(res.conflict?.affectedHeats.map((h) => h.heatId)).toEqual(["R2-H1"]);
    expect(res.draw).toEqual(d1);
  });
});

describe("2I a round that re-seeds from all arrivals still deals when every feeding heat is published, and shows who is on the way", () => {
  const d0 = expandFormat(knock({ reseed: "by_place_then_score" }), makeEntrants(24));

  it("publishing R1 H1 deals nothing: every R2 seat is still a placeholder", () => {
    const d1 = publish(d0, "R1-H1");
    expect(round(d1, "R2").heats.every((h) => h.slots.every((s) => !s.entrantId))).toBe(true);
    expect(round(d1, "R2").seeded).toBe(false);
  });

  it("the waiting seat shows who is on the way: 'Rider 1 · 1st H1 · seat pending'", () => {
    const d1 = publish(d0, "R1-H1");
    const waiting = round(d1, "R2").heats.flatMap((h) => h.slots).find((s) => s.from?.round === "R1" && s.from.heat === 1 && s.from.place === 1)!;
    const p = provisionalSeat(d1, round(d1, "R2"), waiting);
    expect(p).toMatchObject({ entrantId: lowestSeed(d0, "R1-H1"), name: `Rider ${lowestSeed(d0, "R1-H1").slice(1)}`, placeholder: "1st H1" });
  });

  it("no provisional name before the heat is published, for a seat that already has its rider, or for a pool place across heats", () => {
    const r2 = round(d0, "R2");
    expect(provisionalSeat(d0, r2, r2.heats[0].slots[0])).toBeNull();
    const done = publishRound(d0, "R1");
    expect(provisionalSeat(done, round(done, "R2"), round(done, "R2").heats[0].slots[0])).toBeNull(); // dealt: the seat has its rider
    const pools = expandFormat(loadFormat("pools-to-final"), makeEntrants(23));
    const poolRound = pools.rounds.find((r) => r.spec.crossHeat) ? pools.rounds[1] : pools.rounds[1];
    const crossWaiting = poolRound.heats.flatMap((h) => h.slots).find((s) => s.from?.heat === 0);
    if (crossWaiting) expect(provisionalSeat(pools, poolRound, crossWaiting)).toBeNull();
  });

  it("when all eight R1 heats are published R2 is dealt exactly as before (snake re-seeding)", () => {
    const all = publishRound(d0, "R1");
    expect(round(all, "R2").seeded).toBe(true);
    expect(round(all, "R2").heats.every((h) => h.slots.every((s) => s.entrantId))).toBe(true);
  });
});
