import { describe, expect, it } from "vitest";
import { nextStep, runOrder, whoJoins, type PlanHeat } from "./autoplay";

let n = 0;
const heat = (over: Partial<PlanHeat> = {}): PlanHeat => ({
  id: `h${++n}`,
  status: "scheduled",
  divisionSort: 1,
  roundSort: 1,
  number: n,
  suffix: null,
  locked: true,
  filled: true,
  ...over,
});

describe("the run order the simulator follows", () => {
  it("the active run order first, in its own order", () => {
    const a = heat({ id: "a", number: 1 });
    const b = heat({ id: "b", number: 2 });
    const c = heat({ id: "c", number: 3 });
    expect(runOrder([a, b, c], ["c", "a", "b"]).map((h) => h.id)).toEqual(["c", "a", "b"]);
  });
  it("heats missing from the run order follow, in division, round and heat order", () => {
    const a = heat({ id: "a", divisionSort: 1, roundSort: 1, number: 1 });
    const b = heat({ id: "b", divisionSort: 2, roundSort: 1, number: 1 });
    const c = heat({ id: "c", divisionSort: 1, roundSort: 2, number: 3 });
    expect(runOrder([b, c, a], ["a"]).map((h) => h.id)).toEqual(["a", "c", "b"]);
  });
  it("with no run order at all, the default order; a re-run comes right after its heat", () => {
    const a = heat({ id: "a", number: 1 });
    const b = heat({ id: "b", number: 2 });
    const r = heat({ id: "r", number: 2, suffix: "R" });
    expect(runOrder([r, b, a], null).map((h) => h.id)).toEqual(["a", "b", "r"]);
  });
  it("ignores ids of heats that no longer exist", () => {
    expect(runOrder([heat({ id: "a" })], ["gone", "a"]).map((h) => h.id)).toEqual(["a"]);
  });
});

describe("what the auto-play does next", () => {
  const go = (heats: PlanHeat[], over: Partial<Parameters<typeof nextStep>[0]> = {}) => nextStep({ ordered: heats, hold: false, maxRunning: 1, ...over });

  it("starts the first heat that has not started", () => {
    expect(go([heat({ id: "a", status: "published" }), heat({ id: "b" }), heat({ id: "c" })])).toEqual({ kind: "start", heatId: "b" });
  });
  it("skips heats that were cancelled (a re-run takes their place)", () => {
    expect(go([heat({ id: "a", status: "cancelled" }), heat({ id: "b" })])).toEqual({ kind: "start", heatId: "b" });
  });
  it("waits while a heat is running or paused", () => {
    expect(go([heat({ status: "running" }), heat()])).toMatchObject({ kind: "wait", reason: "heat_running" });
    expect(go([heat({ status: "paused" }), heat()])).toMatchObject({ kind: "wait", reason: "heat_running" });
  });
  it("starts another when the event allows more at once", () => {
    expect(go([heat({ status: "running" }), heat({ id: "b" })], { maxRunning: 2 })).toEqual({ kind: "start", heatId: "b" });
  });
  it("waits for a heat that has ended to be published before the next one", () => {
    expect(go([heat({ id: "a", status: "ended" }), heat()])).toMatchObject({ kind: "wait", reason: "review", heatId: "a" });
    expect(go([heat({ id: "a", status: "under_review" }), heat()])).toMatchObject({ kind: "wait", reason: "review", heatId: "a" });
  });
  it("waits while the run order is on hold", () => {
    expect(go([heat()], { hold: true })).toMatchObject({ kind: "wait", reason: "hold" });
  });
  it("waits when the next heat is not ready (draw not locked, or a seat still empty)", () => {
    expect(go([heat({ id: "a", locked: false })])).toMatchObject({ kind: "wait", reason: "not_ready", heatId: "a" });
    expect(go([heat({ id: "a", filled: false })])).toMatchObject({ kind: "wait", reason: "not_ready", heatId: "a" });
  });
  it("is finished when every heat is published or cancelled", () => {
    expect(go([heat({ status: "published" }), heat({ status: "cancelled" })])).toEqual({ kind: "finished" });
    expect(go([])).toEqual({ kind: "finished" });
  });
});

describe("who plays each seat", () => {
  it("a virtual seat held by the simulator is played by the simulator", () => {
    expect(whoJoins({ mode: "virtual", boundUser: "v1", virtualUser: "v1" })).toBe("simulator");
  });
  it("a virtual seat with nobody in it is the simulator's to take", () => {
    expect(whoJoins({ mode: "virtual", boundUser: null, virtualUser: "v1" })).toBe("simulator");
    expect(whoJoins({ mode: "virtual", boundUser: null, virtualUser: null })).toBe("simulator");
  });
  it("a virtual seat that a phone has taken is left alone", () => {
    expect(whoJoins({ mode: "virtual", boundUser: "phone", virtualUser: "v1" })).toBe("person");
  });
  it("a real seat is a person's, connected or not", () => {
    expect(whoJoins({ mode: "real", boundUser: null, virtualUser: "v1" })).toBe("person");
    expect(whoJoins({ mode: "real", boundUser: "phone", virtualUser: "v1" })).toBe("person");
  });
});

describe("a heat with one rider who can ride (Console – Walkover)", () => {
  it("is not started: a person who is the head judge presses Walkover, so the auto-play waits", () => {
    const a = heat({ id: "a", walkover: "walkover" });
    expect(nextStep({ ordered: [a], hold: false, maxRunning: 1, personHead: true })).toEqual({ kind: "wait", reason: "walkover", heatId: "a" });
  });
  it("when the head judge is the simulator's, the virtual head gives the walkover (or finishes the heat with no rider)", () => {
    expect(nextStep({ ordered: [heat({ id: "a", walkover: "walkover" })], hold: false, maxRunning: 1, personHead: false })).toEqual({ kind: "walkover", heatId: "a" });
    expect(nextStep({ ordered: [heat({ id: "b", walkover: "nobody" })], hold: false, maxRunning: 1, personHead: false })).toEqual({ kind: "walkover", heatId: "b" });
  });
  it("a heat that can be ridden starts as before", () => {
    expect(nextStep({ ordered: [heat({ id: "a", walkover: null })], hold: false, maxRunning: 1 })).toEqual({ kind: "start", heatId: "a" });
  });
  it("the hold still holds it", () => {
    expect(nextStep({ ordered: [heat({ id: "a", walkover: "walkover" })], hold: true, maxRunning: 1, personHead: false })).toMatchObject({ kind: "wait", reason: "hold" });
  });
});

