// Phase 4b — the custom ladder builder: every red fault and amber recommendation, the one-tap fixes, a hand-built 24-rider knockout
// equal to the generated one, the JSON round trip, loading a generated format into the builder, and a property test that any ladder
// without a red fault runs from the first heat to the final with every rider placed.
import { describe, expect, it } from "vitest";
import { parseFormatTemplate } from "@/lib/schemas/format-template";
import {
  addHeat,
  addRound,
  advancingPlaces,
  clearSeat,
  moveRound,
  newLadder,
  placeOptions,
  receives,
  removeHeat,
  removeRound,
  renameHeat,
  renameRound,
  sendPlace,
  setAdvance,
  setSeat,
  setSeatCount,
  LadderEditError,
  type CustomLadder,
} from "./custom-ladder";
import { addNeededHeats, allowSize, applyFix, checkLadder, fillSeats, planNewHeats, suggestSplits, trimSeats, type Fault, type RiderRef } from "./custom-ladder-check";
import { drawToLadder, ladderTemplate, ladderToDraw, LadderConvertError } from "./custom-ladder-draw";
import { applyHeatResult, divisionPlacings, expandFormat } from "./index";
import { loadFormat, makeEntrants, publishRound, resultBy, round } from "./fixtures";
import type { DivisionDraw } from "./types";

const riders = (n: number): RiderRef[] => makeEntrants(n).map((e) => ({ id: e.id, name: e.name }));
const codes = (faults: Fault[]) => faults.map((f) => f.code);
const messages = (l: CustomLadder, n: number) => checkLadder(l, riders(n)).faults.map((f) => f.message);
const recos = (l: CustomLadder, n: number) => checkLadder(l, riders(n)).recommendations.map((r) => r.message);

/** Round 1 of `n` riders as heats of `size`, seeds 1..n dealt in order. */
function firstRound(n: number, size: number, l = newLadder(size, Math.max(2, size - 1), size + 1)): CustomLadder {
  let next = addRound(l);
  for (let i = 0; i < n / size; i++) next = addHeat(next, "R1", size);
  return fillSeats(next, riders(n));
}

describe("red faults (they block Apply to draw, never editing or saving a draft)", () => {
  it("no rounds yet: add a round", () => {
    expect(messages(newLadder(), 24)).toEqual(["Add a round to start the ladder."]);
  });

  it("Round 1 seats not equal to the riders: '24 riders, 21 seats — 3 riders have no heat'", () => {
    const l = firstRound(21, 3);
    const c = checkLadder(l, riders(24));
    expect(c.faults.find((f) => f.code === "first_round_seats")?.message).toBe("24 riders, 21 seats — 3 riders have no heat.");
    const tooMany = checkLadder(firstRound(24, 3), riders(21));
    expect(tooMany.faults.find((f) => f.code === "first_round_seats")?.message).toBe("21 riders, 24 seats — 3 seats have no rider.");
  });

  it("a seed, a rider and a place used twice", () => {
    let l = firstRound(6, 3);
    l = setSeat(l, { round: "R1", heat: 2, seat: 0 }, { type: "seed", seed: 1 });
    expect(messages(l, 6)).toContain("Seed 1 is used twice (R1 H1 and R1 H2).");
    l = setSeat(l, { round: "R1", heat: 2, seat: 0 }, { type: "rider", entrantId: "r2" });
    expect(messages(l, 6).join("|")).toContain("Rider 2 is used twice");
    let m = addRound(l);
    m = addHeat(m, "R2", 2);
    m = setSeat(m, { round: "R2", heat: 1, seat: 0 }, { type: "place", round: "R1", heat: 1, place: 1 });
    m = setSeat(m, { round: "R2", heat: 1, seat: 1 }, { type: "place", round: "R1", heat: 1, place: 1 });
    expect(messages(m, 6)).toContain("1st R1 H1 is used twice (R2 H1 and R2 H1).");
  });

  it("a heat under the minimum or over the maximum, with a one-tap fix that allows it for that round", () => {
    let l = newLadder(3, 3, 3);
    l = addRound(l);
    l = addHeat(l, "R1", 2);
    l = addHeat(l, "R1", 4);
    const c = checkLadder(l, riders(6));
    expect(c.faults.filter((f) => f.code === "heat_under_min" || f.code === "heat_over_max").map((f) => f.message)).toEqual(["R1 H1 has 2 seats, minimum is 3.", "R1 H2 has 4 seats, maximum is 3."]);
    const under = c.faults.find((f) => f.code === "heat_under_min")!;
    expect(under.fix).toMatchObject({ id: "allow_size", round: "R1", size: 2 });
    const fixed = applyFix(l, riders(6), under.fix!);
    expect(codes(checkLadder(fixed, riders(6)).faults)).not.toContain("heat_under_min");
    expect(codes(checkLadder(fixed, riders(6)).faults)).toContain("heat_over_max");
  });

  it("a round receiving more or fewer riders than it has seats", () => {
    // 24 riders, 8 heats of 3, 1 advances: 8 winners arrive in round 2, which has 2 heats of 3 = 6 seats
    let l = firstRound(24, 3);
    l = addRound(l);
    l = addHeat(addHeat(l, "R2", 3), "R2", 3);
    l = addRound(l);
    l = addHeat(l, "R3", 2);
    l = setAdvance(l, "R2", 1);
    const c = checkLadder(l, riders(24));
    expect(c.faults.map((f) => f.message)).toContain("Round 2 receives 8 riders but has 6 seats — 2 riders have nowhere to go.");
    expect(c.faults.find((f) => f.code === "round_receives")?.fix?.id).toBe("add_heats");
    const l2 = setAdvance(firstRound(24, 3), "R1", 1);
    let m = addRound(l2);
    m = addHeat(m, "R2", 5); // room for 10, 8 arrive
    const more = checkLadder(m, riders(24)).faults.find((f) => f.code === "round_receives")!;
    expect(more.message).toBe("Round 2 receives 8 riders but has 5 seats — 3 riders have nowhere to go.");
    const slack = addHeat(addHeat(addRound(l2), "R2", 5), "R2", 5);
    expect(checkLadder(slack, riders(24)).faults.find((f) => f.code === "round_receives")?.message).toBe("Round 2 has 10 seats but receives only 8 riders — 2 seats stay empty.");
  });

  it("a final with fewer than 2 seats", () => {
    let l = firstRound(6, 3);
    l = addRound(l);
    l = addHeat(l, "R2", 1);
    expect(messages(l, 6)).toContain("The final has 1 seat — a final needs at least 2.");
  });

  it("a heat that depends on a heat placed after it (or in its own round)", () => {
    let l = firstRound(6, 3);
    l = addRound(l);
    l = addHeat(l, "R2", 2);
    // the builder refuses it when you try…
    expect(() => setSeat(l, { round: "R1", heat: 1, seat: 0 }, { type: "place", round: "R2", heat: 1, place: 1 })).toThrow(LadderEditError);
    // …but a pasted or imported ladder can carry it, and the checker says so
    const raw = structuredClone(l);
    raw.rounds[0].heats[0].seats[0] = { type: "place", round: "R2", heat: 1, place: 1 };
    expect(messages(raw, 6).some((m) => m.includes("which comes after it"))).toBe(true);
  });

  it("a round whose advancing places go nowhere although it is not the final", () => {
    let l = firstRound(6, 3);
    l = addHeat(addRound(l), "R2", 2);
    l = setAdvance(l, "R1", 0);
    expect(messages(l, 6)).toContain("Round 1's advancing places go nowhere, although it is not the final. Set how many places go on.");
  });

  it("an empty heat, and a round with no heats", () => {
    let l = firstRound(6, 3);
    l = addHeat(l, "R1", 3);
    expect(messages(l, 6)).toContain("R1 H3 is empty.");
    l = addRound(l);
    expect(messages(l, 6)).toContain("Round 2 has no heats.");
  });

  it("an empty seat in a heat that has others", () => {
    let l = firstRound(6, 3);
    l = clearSeat(l, { round: "R1", heat: 1, seat: 1 });
    const f = checkLadder(l, riders(6)).faults.find((x) => x.code === "seat_empty")!;
    expect(f.message).toBe("R1 H1 has 1 empty seat.");
    expect(f.fix?.id).toBe("fill_seats");
  });

  it("seeds and riders belong in the first round only, and must exist", () => {
    let l = firstRound(6, 3);
    l = addHeat(addRound(l), "R2", 2);
    const raw = structuredClone(l);
    raw.rounds[1].heats[0].seats[0] = { type: "seed", seed: 1 };
    expect(messages(raw, 6).some((m) => m.includes("only the first round can"))).toBe(true);
    expect(() => setSeat(l, { round: "R2", heat: 1, seat: 0 }, { type: "seed", seed: 1 })).toThrow(/first round/);
    l = setSeat(l, { round: "R1", heat: 1, seat: 0 }, { type: "seed", seed: 30 });
    expect(messages(l, 6).join("|")).toContain("Seed 30 does not exist — there are 6 riders.");
  });

  it("a place that does not advance, and a place of a heat that is not there", () => {
    let l = firstRound(6, 3);
    l = addHeat(addRound(l), "R2", 2);
    const raw = structuredClone(l);
    raw.rounds[1].heats[0].seats[0] = { type: "place", round: "R1", heat: 1, place: 3 };
    raw.rounds[1].heats[0].seats[1] = { type: "place", round: "R1", heat: 9, place: 1 };
    const m = messages(raw, 6).join("|");
    expect(m).toContain("but only the top 1 of Round 1 go on");
    expect(m).toContain("which does not exist");
  });

  it("the same place of a round cannot go to two different rounds", () => {
    let l = firstRound(6, 3);
    l = addRound(l);
    l = addHeat(l, "R2", 1);
    l = addRound(l);
    l = addHeat(l, "R3", 1);
    l = setSeat(l, { round: "R2", heat: 1, seat: 0 }, { type: "place", round: "R1", heat: 1, place: 1 });
    l = setSeat(l, { round: "R3", heat: 1, seat: 0 }, { type: "place", round: "R1", heat: 2, place: 1 });
    expect(messages(l, 6).join("|")).toContain("1st place of Round 1 goes to Round 2 and Round 3");
  });
});

describe("amber recommendations (never block)", () => {
  it("'24 riders → 8 heats of 3, or 6 of 4' when the first round does not match", () => {
    const l = addRound(newLadder(3, 3, 3));
    expect(recos(l, 24)).toContain("24 riders → 8 heats of 3, or 6 of 4.");
    const c = checkLadder(firstRound(24, 3), riders(24));
    expect(c.recommendations.map((r) => r.code)).not.toContain("heats_for_field");
  });

  it("'8 winners arrive in Round 2 → 4 heats of 2, or 2 heats of 4'", () => {
    let l = firstRound(24, 3);
    l = addHeat(addRound(l), "R2", 3);
    l = addHeat(addRound(l), "R3", 2);
    expect(recos(l, 24)).toContain("8 winners arrive in Round 2 → 4 heats of 2, or 2 heats of 4.");
  });

  it("'Round 3 has 4 heats of 1 — merge them?'", () => {
    let l = firstRound(24, 3);
    l = addRound(l);
    l = addRound(l);
    for (let i = 0; i < 4; i++) l = addHeat(l, "R3", 1);
    expect(recos(l, 24)).toContain("Round 3 has 4 heats of 1 — merge them?");
  });

  it("'Riders knocked out in Round 1 ride once — add a second-chance round?'", () => {
    let l = firstRound(12, 3);
    l = addHeat(addRound(l), "R2", 4);
    expect(recos(l, 12)).toContain("Riders knocked out in Round 1 ride once — add a second-chance round?");
    // with a place 2 sent on, the hint goes away
    let m = setAdvance(l, "R1", 2);
    m = setSeat(m, { round: "R2", heat: 1, seat: 0 }, { type: "place", round: "R1", heat: 1, place: 2 });
    expect(recos(m, 12).some((x) => x.startsWith("Riders knocked out"))).toBe(false);
  });

  it("'Final of 2 — a final of 3–4 gives the crowd more'", () => {
    let l = firstRound(6, 3);
    l = addHeat(addRound(l), "R2", 2);
    expect(recos(l, 6)).toContain("Final of 2 — a final of 3–4 gives the crowd more.");
  });

  it("a heat that sends everybody on eliminates nobody", () => {
    let l = firstRound(6, 3);
    l = setAdvance(l, "R1", 3);
    l = addHeat(addRound(l), "R2", 6);
    expect(recos(l, 6).some((x) => x.includes("sends everybody on"))).toBe(true);
  });

  it("recommendations never make a ladder incomplete", () => {
    let l = firstRound(6, 3);
    l = addHeat(addRound(l), "R2", 2);
    l = fillSeats(l, riders(6));
    const c = checkLadder(l, riders(6));
    expect(c.complete).toBe(true);
    expect(c.recommendations.length).toBeGreaterThan(0);
  });
});

describe("splits", () => {
  it("suggestSplits: exact splits closest to the target first", () => {
    expect(suggestSplits(24, 3).map((s) => s.text)).toEqual(["8 heats of 3", "6 heats of 4"]);
    expect(suggestSplits(8, 3).map((s) => s.text)).toEqual(["4 heats of 2", "2 heats of 4"]);
    expect(suggestSplits(22, 3).map((s) => s.text)).toEqual(["11 heats of 2", "8 heats of 2–3"]);
    expect(suggestSplits(1, 3)).toEqual([]);
  });

  it("planNewHeats spreads the riders evenly within the limits", () => {
    expect(planNewHeats(8, 3, 2, 4)).toEqual([2, 3, 3]);
    expect(planNewHeats(6, 3, 3, 3)).toEqual([3, 3]);
    expect(planNewHeats(2, 3, 2, 4)).toEqual([2]);
    expect(planNewHeats(0, 3, 2, 4)).toEqual([]);
  });
});

describe("one-tap fixes", () => {
  it("Fill the remaining seats in order: Round 1 takes the next unused seeds; later rounds take the unused places, 1sts first", () => {
    let l = addRound(newLadder(3, 3, 3));
    for (let i = 0; i < 8; i++) l = addHeat(l, "R1");
    l = addHeat(addRound(l), "R2", 2);
    l = addHeat(l, "R2", 2);
    l = fillSeats(l, riders(24));
    expect(l.rounds[0].heats[0].seats).toEqual([{ type: "seed", seed: 1 }, { type: "seed", seed: 2 }, { type: "seed", seed: 3 }]);
    expect(l.rounds[1].heats[0].seats).toEqual([{ type: "place", round: "R1", heat: 1, place: 1 }, { type: "place", round: "R1", heat: 2, place: 1 }]);
    expect(l.rounds[1].heats[1].seats[1]).toEqual({ type: "place", round: "R1", heat: 4, place: 1 });
  });

  it("the fix never takes a seat that is already filled, and never uses a place twice", () => {
    let l = firstRound(6, 3);
    l = addHeat(addRound(l), "R2", 2);
    l = setSeat(l, { round: "R2", heat: 1, seat: 1 }, { type: "place", round: "R1", heat: 1, place: 1 });
    l = fillSeats(l, riders(6));
    expect(l.rounds[1].heats[0].seats).toEqual([{ type: "place", round: "R1", heat: 2, place: 1 }, { type: "place", round: "R1", heat: 1, place: 1 }]);
  });

  it("Add the heats this round needs: 8 winners, 2 seats → new heats until every winner has a seat", () => {
    let l = setAdvance(firstRound(24, 3), "R1", 1);
    l = addHeat(addRound(l), "R2", 2);
    const fixed = addNeededHeats(l, riders(24), "R2");
    expect(fixed.rounds[1].heats.reduce((n, h) => n + h.seats.length, 0)).toBe(8);
    expect(fixed.rounds[1].heats.every((h) => h.seats.length >= 2 && h.seats.length <= 4)).toBe(true);
  });

  it("Remove the extra seats: empty seats go from the end", () => {
    let l = setAdvance(firstRound(6, 3), "R1", 1);
    l = addHeat(addHeat(addRound(l), "R2", 2), "R2", 2);
    const fixed = trimSeats(l, riders(6), "R2");
    expect(fixed.rounds[1].heats.map((h) => h.seats.length)).toEqual([2]);
  });

  it("Allow heats of 2 in this round changes only that round", () => {
    const l = allowSize(addRound(newLadder(3, 3, 3)), "R1", 2);
    expect(l.rounds[0].minHeatSize).toBe(2);
    expect(l.minHeatSize).toBe(3);
  });
});

describe("the hand-built 24-rider knockout equals the generated one", () => {
  const template = loadFormat("heats4-top2-single-elim", (j) => {
    j.generator.params = { ...j.generator.params, heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2, reseed: "by_original_seed" };
  });
  const entrants = makeEntrants(24);
  const generated = expandFormat(template, entrants, { identification: "name-callout" });

  /** What a person does on the whiteboard: rounds, heats, seeds for Round 1, then "fill the remaining seats" for the rest. */
  function handBuilt(): CustomLadder {
    let l = newLadder(3, 3, 3);
    for (const [i, name] of ["Round 1", "Round 2", "Semi-finals", "Final"].entries()) {
      l = addRound(l, name);
      const id = `R${i + 1}`;
      const heats = [8, 4, 2, 1][i];
      const size = i === 0 ? 3 : 2;
      for (let h = 0; h < heats; h++) l = addHeat(l, id, size);
      l = setAdvance(l, id, i === 3 ? 0 : 1);
      if (i > 0) l = allowSize(l, id, 2);
    }
    // Round 1: the seeds exactly as the generated draw dealt them
    generated.rounds[0].heats.forEach((h, hi) => h.slots.forEach((s, si) => (l = setSeat(l, { round: "R1", heat: hi + 1, seat: si }, { type: "seed", seed: s.seed! }))));
    l = fillSeats(l, riders(24));
    // heat lengths as the generator set them
    l.rounds.forEach((r, i) => (r.durationMin = generated.rounds[i].heats[0].durationMin));
    return l;
  }

  it("the checker is green for it: 'Ladder complete — 15 heats, 24 riders, every place accounted for'", () => {
    const c = checkLadder(handBuilt(), riders(24));
    expect(c.faults).toEqual([]);
    expect(c.status).toBe("Ladder complete — 15 heats, 24 riders, every place accounted for");
  });

  it("before the last fixes it is red and says why (heats of 2 under the minimum of 3)", () => {
    let l = newLadder(3, 3, 3);
    l = addRound(l);
    for (let h = 0; h < 8; h++) l = addHeat(l, "R1");
    l = fillSeats(l, riders(24));
    l = addRound(l);
    for (let h = 0; h < 4; h++) l = addHeat(l, "R2", 2);
    expect(codes(checkLadder(l, riders(24)).faults)).toContain("heat_under_min");
  });

  it("produces the same rounds, heats, seats, numbers and lengths", () => {
    const hand = ladderToDraw(ladderTemplate(handBuilt(), { name: "Hand built" }), entrants, { identification: "name-callout" });
    const core = (d: DivisionDraw) =>
      d.rounds.map((r, ri) => ({
        name: r.name,
        seeded: r.seeded,
        expected: r.expectedEntrants,
        heats: r.heats.map((h) => ({
          n: h.number,
          bye: h.bye,
          dur: h.durationMin,
          brk: [h.breakAfterHeatMin, h.breakAfterRoundMin],
          last: h.roundLast,
          status: h.status,
          slots: h.slots.map((s) => ({ seed: s.seed, rider: s.entrantId, from: s.from ? { ...s.from, round: `#${d.rounds.findIndex((x) => x.id === s.from!.round)}` } : undefined })),
        })),
        ri,
      }));
    expect(core(hand)).toEqual(core(generated));
    expect(hand.rounds.map((r) => r.heats.length)).toEqual([8, 4, 2, 1]);
  });

  it("it runs end to end like the generated one: the same winners reach the same heats", () => {
    const hand = ladderToDraw(ladderTemplate(handBuilt(), { name: "Hand built" }), entrants, { identification: "name-callout" });
    let a = generated;
    let b = hand;
    for (const [i, r] of generated.rounds.entries()) {
      a = publishRound(a, r.id);
      b = publishRound(b, hand.rounds[i].id);
    }
    const ids = (d: DivisionDraw) => d.rounds.flatMap((r) => r.heats.map((h) => h.slots.map((s) => s.entrantId).join(",")));
    expect(ids(b)).toEqual(ids(a));
    expect(divisionPlacings(b).map((p) => [p.entrantId, p.place])).toEqual(divisionPlacings(a).map((p) => [p.entrantId, p.place]));
  });
});

describe("saving: JSON round trip and loading a generated format", () => {
  it("a saved custom ladder survives JSON exactly and parses as a format template", () => {
    let l = firstRound(6, 3);
    l = addHeat(addRound(l, "Final"), "R2", 2);
    l = fillSeats(renameHeat(renameRound(l, "R1", "Heats"), "R1", 1, "Opening"), riders(6));
    const tpl = ladderTemplate(l, { name: "My ladder", description: "Two heats and a final" });
    const back = parseFormatTemplate(JSON.parse(JSON.stringify(tpl)));
    expect(back.ladder).toEqual(l);
    expect(back.kind).toBe("ladder");
    expect(JSON.parse(JSON.stringify(back))).toEqual(JSON.parse(JSON.stringify(tpl)));
    // and draws identically
    const a = ladderToDraw(tpl, makeEntrants(6));
    const b = ladderToDraw(back, makeEntrants(6));
    expect(JSON.stringify(b.rounds)).toBe(JSON.stringify(a.rounds));
  });

  it("a format template of kind ladder needs a ladder, and no other kind may carry one", () => {
    expect(() => parseFormatTemplate({ id: "x", name: "x", entrants: { min: 2, max: null }, timing: { defaultHeatMin: 10, defaultBreakAfterHeatMin: 3, defaultBreakAfterRoundMin: 5 }, kind: "ladder" })).toThrow(/ladder/);
  });

  it("'Start from Knockout and edit': a generated knockout loads into the builder and draws the same", () => {
    const template = loadFormat("heats4-top2-single-elim", (j) => {
      j.generator.params = { ...j.generator.params, heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2, reseed: "by_original_seed" };
    });
    const entrants = makeEntrants(24);
    const generated = expandFormat(template, entrants, { identification: "name-callout" });
    const ladder = drawToLadder(generated);
    expect(ladder.rounds.map((r) => [r.name, r.heats.length, r.advance])).toEqual([["Round 1", 8, 1], ["Round 2", 4, 1], ["Semi-finals", 2, 1], ["Final", 1, 0]]);
    const c = checkLadder(ladder, riders(24));
    expect(c.faults).toEqual([]);
    const again = ladderToDraw(ladderTemplate(ladder, { name: "From knockout" }), entrants, { identification: "name-callout" });
    const shape = (d: DivisionDraw) => d.rounds.map((r) => r.heats.map((h) => h.slots.map((s) => s.seed ?? `${s.from!.heat}.${s.from!.place}`).join(",")));
    expect(shape(again)).toEqual(shape(generated));
  });

  it("any generated format that uses places loads into the builder with a green checker (second chance, double elimination, single elimination)", () => {
    for (const [name, n] of [["heats4-top2-single-elim", 14], ["kota-dingle", 14], ["double-elimination", 14], ["single-final", 6]] as const) {
      const template = loadFormat(name);
      const entrants = makeEntrants(n);
      const draw = expandFormat(template, entrants, { identification: "name-callout" });
      const ladder = drawToLadder(draw);
      const c = checkLadder(ladder, riders(n));
      expect(c.faults.map((f) => f.message), `${name} with ${n} riders`).toEqual([]);
    }
  });

  it("a format that ranks riders across heats says so in plain words instead of breaking", () => {
    const template = loadFormat("pools-to-final");
    const draw = expandFormat(template, makeEntrants(23), { identification: "name-callout" });
    expect(() => drawToLadder(draw)).toThrow(LadderConvertError);
  });
});

describe("editing the ladder", () => {
  it("+ / − seats, rename, move and remove; removing a heat renumbers the later heats and empties the seats that waited for it", () => {
    let l = firstRound(9, 3);
    l = addHeat(addRound(l), "R2", 3);
    l = fillSeats(l, riders(9));
    l = removeHeat(l, "R1", 2);
    expect(l.rounds[0].heats).toHaveLength(2);
    expect(l.rounds[1].heats[0].seats).toEqual([{ type: "place", round: "R1", heat: 1, place: 1 }, { type: "empty" }, { type: "place", round: "R1", heat: 2, place: 1 }]);
    l = setSeatCount(l, "R1", 1, 5);
    expect(l.rounds[0].heats[0].seats).toHaveLength(5);
    l = setSeatCount(l, "R1", 1, 2);
    expect(l.rounds[0].heats[0].seats).toHaveLength(2);
    expect(() => setSeatCount(l, "R1", 1, 11)).toThrow(/0 to 10/);
    l = moveRound(l, "R2", -1);
    expect(l.rounds.map((r) => r.id)).toEqual(["R2", "R1"]);
    l = removeRound(l, "R1");
    expect(l.rounds.map((r) => r.id)).toEqual(["R2"]);
    expect(() => renameRound(l, "R2", " ")).toThrow(/name/);
  });

  it("the reverse gesture: '1st →' sends a place to a seat, and it leaves any seat it had, so nothing is placed twice", () => {
    let l = firstRound(6, 3);
    l = addHeat(addRound(l), "R2", 2);
    l = sendPlace(l, { round: "R1", heat: 1, place: 1 }, { round: "R2", heat: 1, seat: 0 });
    l = sendPlace(l, { round: "R1", heat: 1, place: 1 }, { round: "R2", heat: 1, seat: 1 });
    expect(l.rounds[1].heats[0].seats).toEqual([{ type: "empty" }, { type: "place", round: "R1", heat: 1, place: 1 }]);
  });

  it("the dropdown lists the places of earlier rounds with where each one is used", () => {
    let l = firstRound(6, 3);
    l = addHeat(addRound(l), "R2", 2);
    l = setSeat(l, { round: "R2", heat: 1, seat: 0 }, { type: "place", round: "R1", heat: 2, place: 1 });
    const options = placeOptions(l, "R2");
    expect(options.map((o) => [o.label, o.usedAt ? `${o.usedAt.round} H${o.usedAt.heat}` : null])).toEqual([["1st H1", null], ["1st H2", "R2 H1"]]);
    expect(placeOptions(l, "R1")).toEqual([]);
  });

  it("two rounds back the label names the round: '1st R1 H3'", () => {
    let l = firstRound(6, 3);
    l = addHeat(addRound(l), "R2", 2);
    l = addHeat(addRound(l), "R3", 2);
    expect(placeOptions(l, "R3").map((o) => o.label)).toEqual(expect.arrayContaining(["1st R1 H1", "1st R1 H2"]));
  });

  it("advancing places and what each round receives follow the 'places that go on' setting", () => {
    let l = firstRound(12, 4);
    l = addRound(l);
    l = setAdvance(l, "R1", 2);
    expect(advancingPlaces(l, "R1")).toHaveLength(6);
    expect(receives(l).get("R2")).toBe(6);
  });
});

// ── property: any ladder without a red fault runs end to end ──────────────────────────────────

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A knockout-style ladder built only with the builder's own functions and fixes. */
function randomKnockout(rand: () => number): { ladder: CustomLadder; n: number } {
  const n = 4 + Math.floor(rand() * 27);
  const target = 3 + Math.floor(rand() * 2);
  let l = newLadder(target, 2, target + 1);
  l = addRound(l);
  const r1 = planNewHeats(n, target, 2, target + 1);
  for (const size of r1) l = addHeat(l, "R1", size);
  l = fillSeats(l, riders(n));
  let arriving = n;
  let ri = 1;
  let sizes = r1;
  const finish = (ladder: CustomLadder) => {
    // what a person does when the checker shows red: press the one-tap fixes
    let next = ladder;
    for (let pass = 0; pass < 4; pass++) {
      const fix = checkLadder(next, riders(n)).faults.find((f) => f.fix)?.fix;
      if (!fix) break;
      next = applyFix(next, riders(n), fix);
    }
    return next;
  };
  while (true) {
    const minSize = Math.min(...sizes);
    const advance = Math.max(1, Math.min(minSize - 1, 1 + Math.floor(rand() * 2)));
    l = setAdvance(l, `R${ri}`, advance);
    arriving = sizes.reduce((s, x) => s + Math.min(advance, x), 0);
    l = addRound(l);
    ri++;
    if (arriving <= 6 || ri > 7) {
      l = addHeat(l, `R${ri}`, arriving);
      l = fillSeats(l, riders(n));
      l = finish(l);
      break;
    }
    sizes = planNewHeats(arriving, target, 2, target + 1);
    for (const size of sizes) l = addHeat(l, `R${ri}`, size);
    l = fillSeats(l, riders(n));
  }
  return { ladder: l, n };
}

function runEndToEnd(ladder: CustomLadder, n: number, rand: () => number): void {
  const entrants = makeEntrants(n);
  let draw = ladderToDraw(ladderTemplate(ladder, { name: "x" }), entrants, { identification: "name-callout" });
  const firstRiders = draw.rounds[0].heats.flatMap((h) => h.slots.map((s) => s.entrantId));
  expect(firstRiders.every(Boolean)).toBe(true);
  expect(new Set(firstRiders).size).toBe(n);
  for (const r of draw.rounds) {
    const live = round(draw, r.id);
    // every seat of a round whose sources are all published holds a rider
    expect(live.heats.every((h) => h.slots.every((s) => s.entrantId)), `${r.id} seats are filled before it runs`).toBe(true);
    for (const h of live.heats) {
      if (h.bye) continue;
      const res = applyHeatResult(draw, h.id, resultBy(round(draw, r.id).heats.find((x) => x.id === h.id)!, () => rand() * 100));
      expect(res.conflict).toBeUndefined();
      draw = res.draw;
    }
  }
  const placings = divisionPlacings(draw);
  expect(new Set(placings.map((p) => p.entrantId)).size).toBe(n);
}

describe("property: any ladder with no red fault runs end to end with every rider placed", () => {
  it("knockout-style ladders built with the builder's own functions (200 random ladders)", () => {
    let complete = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const rand = rng(seed);
      const { ladder, n } = randomKnockout(rand);
      const c = checkLadder(ladder, riders(n));
      if (!c.complete) continue; // a red ladder is not applied to the draw at all
      complete++;
      runEndToEnd(ladder, n, rand);
    }
    expect(complete).toBeGreaterThan(150);
  });

  it("second-chance ladders (Round 1 winners skip Round 2) (60 random ladders)", () => {
    let complete = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const rand = rng(seed * 7919);
      const { ladder, n } = randomSecondChanceLadder(rand);
      const c = checkLadder(ladder, riders(n));
      if (!c.complete) continue;
      complete++;
      runEndToEnd(ladder, n, rand);
    }
    // when Round 3 is a single heat the Final would get one rider: the checker says so (red) and that ladder is not applied
    expect(complete).toBeGreaterThan(30);
  });

  it("random edits: whatever the checker calls complete still runs (400 mutated ladders)", () => {
    let complete = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const rand = rng(seed * 104729);
      const made = randomKnockout(rand);
      let ladder = made.ladder;
      const n = made.n;
      for (let k = 0; k < 3; k++) {
        const r = ladder.rounds[Math.floor(rand() * ladder.rounds.length)];
        const pick = Math.floor(rand() * 5);
        try {
          if (pick === 0) ladder = addHeat(ladder, r.id, 2);
          else if (pick === 1 && r.heats.length > 1) ladder = removeHeat(ladder, r.id, 1 + Math.floor(rand() * r.heats.length));
          else if (pick === 2) ladder = setSeatCount(ladder, r.id, 1 + Math.floor(rand() * r.heats.length), 1 + Math.floor(rand() * 5));
          else if (pick === 3) ladder = setAdvance(ladder, r.id, Math.floor(rand() * 3));
          else ladder = clearSeat(ladder, { round: r.id, heat: 1, seat: 0 });
        } catch {
          /* an edit the builder refuses is simply not made */
        }
      }
      // the one-tap fixes are allowed to repair it
      for (let pass = 0; pass < 3; pass++) {
        const c = checkLadder(ladder, riders(n));
        const fix = c.faults.find((f) => f.fix)?.fix;
        if (!fix) break;
        ladder = applyFix(ladder, riders(n), fix);
      }
      const c = checkLadder(ladder, riders(n));
      if (!c.complete) continue;
      complete++;
      runEndToEnd(ladder, n, rand);
    }
    expect(complete).toBeGreaterThan(20);
  });
});

function randomSecondChanceLadder(rand: () => number): { ladder: CustomLadder; n: number } {
  const heats = 2 + Math.floor(rand() * 5);
  const n = heats * 4;
  let l = newLadder(4, 2, 5);
  l = addRound(l);
  for (let i = 0; i < heats; i++) l = addHeat(l, "R1", 4);
  l = fillSeats(l, riders(n));
  l = setAdvance(l, "R1", 3);
  // Round 2: the 2nd and 3rd of every Round 1 heat, in pairs
  l = addRound(l);
  const pairs = heats * 2;
  const r2 = planNewHeats(pairs, 4, 2, 5);
  for (const size of r2) l = addHeat(l, "R2", size);
  l = sendAll(l, "R2", Array.from({ length: heats }, (_, h) => [2, 3].map((p) => ({ round: "R1", heat: h + 1, place: p }))).flat());
  l = setAdvance(l, "R2", 1);
  // Round 3: Round 1 winners and Round 2 winners
  l = addRound(l);
  const winners = heats + r2.length;
  for (const size of planNewHeats(winners, 4, 2, 5)) l = addHeat(l, "R3", size);
  l = sendAll(l, "R3", [...Array.from({ length: heats }, (_, h) => ({ round: "R1", heat: h + 1, place: 1 })), ...Array.from({ length: r2.length }, (_, h) => ({ round: "R2", heat: h + 1, place: 1 }))]);
  l = setAdvance(l, "R3", 1);
  l = addRound(l);
  const finalists = l.rounds[2].heats.reduce((s, h) => s + Math.min(1, h.seats.length), 0);
  l = addHeat(l, "R4", Math.max(2, finalists));
  l = fillSeats(l, riders(n));
  for (let pass = 0; pass < 4; pass++) {
    const fix = checkLadder(l, riders(n)).faults.find((f) => f.fix)?.fix;
    if (!fix) break;
    l = applyFix(l, riders(n), fix);
  }
  return { ladder: l, n };
}

function sendAll(l: CustomLadder, roundId: string, places: Array<{ round: string; heat: number; place: number }>): CustomLadder {
  let next = l;
  let i = 0;
  const target = next.rounds.find((r) => r.id === roundId)!;
  for (let h = 0; h < target.heats.length; h++) {
    for (let s = 0; s < target.heats[h].seats.length && i < places.length; s++) next = sendPlace(next, places[i++], { round: roundId, heat: h + 1, seat: s });
  }
  return next;
}
