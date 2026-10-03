// Audit 1a (Gouna configuration) — the ladder. See docs/AUDIT.md for the findings (A1a-n) these tests point at.
// The configuration: Knockout, heats of exactly 3 (target 3, minimum 3, maximum 3), 1 advances, final of 2, "By original
// seeding" (adjacent pairing), 24 riders — and 23, 22, 21, 20 after withdrawals before the draw is locked.
import { describe, expect, it } from "vitest";
import type { FormatTemplate } from "@/lib/schemas/format-template";
import { addHeat, addRound, newLadder, setAdvance, setSeat, setSeatCount, LadderEditError, type CustomLadder } from "./custom-ladder";
import { checkLadder, fillSeats, type FaultCode, type RiderRef } from "./custom-ladder-check";
import { CustomLadderSchema } from "@/lib/schemas/custom-ladder";
import { drawToLadder } from "./custom-ladder-draw";
import { expandFormat } from "./expand";
import { heat, loadFormat, makeEntrants, publish, publishAll, round } from "./fixtures";
import { planKnockout } from "./knockout-plan";
import { divisionPlacings } from "./placings";
import { heatCanRun, lockDraw, withdrawEntrant } from "./progress";
import { heatLimits } from "./seeding";
import type { DivisionDraw } from "./types";

const PARAMS = { heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2 };
const GOUNA: FormatTemplate = loadFormat("heats4-top2-single-elim", (j) => Object.assign(j.generator.params, PARAMS));
const heatTotal = (d: DivisionDraw) => d.rounds.reduce((s, r) => s + r.heats.length, 0);
const sizes = (d: DivisionDraw) => d.rounds.map((r) => `${r.id}:${r.heats.map((h) => h.slots.length).join(",")}`).join(" ");

/** A seeded random score per rider and heat, so heats are not simply won by the best seed. */
const randomScore = (salt: number) => (seed: number, heatId: string) => {
  let h = 2166136261 ^ salt;
  for (const ch of `${heatId}|${seed}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h % 4001; // 0.00 … 40.00 in hundredths: totals of the KOTA-style preset
};

/** The draw for N riders as the organiser gets it: 24 entered, the last (24 − N) withdrawn before the draw is locked. */
function drawFor(n: number): DivisionDraw {
  let d = expandFormat(GOUNA, makeEntrants(24));
  for (let s = 24; s > n; s--) d = withdrawEntrant(d, `r${s * 7 % 24 + 1}`); // withdraw spread-out seeds, not just the last ones
  return d;
}

describe("Audit 1a · ladder · N = 24, 23, 22, 21, 20 (withdrawals before lock)", () => {
  for (const n of [24, 23, 22, 21, 20]) {
    describe(`N = ${n}`, () => {
      const d = drawFor(n);

      it("a withdrawal before lock re-deals the field exactly as if the rider had never entered", () => {
        const left = d.entrants.filter((e) => !e.withdrawn);
        expect(left).toHaveLength(n);
        expect(sizes(d)).toBe(sizes(expandFormat(GOUNA, left)));
      });

      it("every heat is within the planner's documented sizes (2 or 3; 1 v 1 only where 3s cannot be kept), no byes", () => {
        const plan = planKnockout(n, { limits: heatLimits(3, 3, 3), advance: 1, finalSize: 2 });
        expect(d.rounds.slice(0, -1).map((r) => r.heats.map((h) => h.slots.length))).toEqual(plan.rounds.map((r) => r.heats));
        for (const r of d.rounds) for (const h of r.heats) {
          expect(h.bye, h.id).toBe(false);
          expect(h.slots.length, h.id).toBeGreaterThanOrEqual(2);
          expect(h.slots.length, h.id).toBeLessThanOrEqual(3);
        }
      });

      it("no round before the final has a single heat", () => {
        for (const r of d.rounds.slice(0, -1)) expect(r.heats.length, r.id).toBeGreaterThanOrEqual(2);
        expect(d.rounds.at(-1)!.heats).toHaveLength(1);
      });

      it("with random results (20 different ones): every rider placed exactly once, and every winner sits where the ladder says", () => {
        for (let salt = 1; salt <= 20; salt++) {
          const done = publishAll(d, randomScore(salt));
          const placings = divisionPlacings(done);
          expect(placings.map((p) => p.entrantId).sort(), `salt ${salt}`).toEqual(d.seedOrder.slice().sort());
          expect(new Set(placings.map((p) => p.entrantId)).size).toBe(n);
          expect(placings.filter((p) => p.place === 1)).toHaveLength(1);
          for (const r of done.rounds.slice(1)) for (const h of r.heats) for (const s of h.slots) {
            const src = s.from!;
            const srcHeat = round(done, src.round).heats[src.heat - 1];
            const winner = done.results[srcHeat.id].ranked.find((x) => x.place === src.place)!.entrantId;
            expect(s.entrantId, `salt ${salt}: ${h.id} seat ${s.index} = ${src.round} H${src.heat} place ${src.place}`).toBe(winner);
          }
        }
      });
    });
  }

  it("N = 24: 8 heats of 3 → 4 → 2 → a final of 2, adjacent heats meet (H1 + H2, H3 + H4, …)", () => {
    const d = drawFor(24);
    expect(d.rounds.map((r) => [r.id, r.heats.length])).toEqual([["R1", 8], ["R2", 4], ["SF", 2], ["F", 1]]);
    expect(heatTotal(d)).toBe(15);
    for (const id of ["R2", "SF", "F"]) {
      round(d, id).heats.forEach((h, i) => expect(h.slots.map((s) => [s.from?.heat, s.from?.place]), `${id} H${i + 1}`).toEqual([[2 * i + 1, 1], [2 * i + 2, 1]]));
    }
  });

  it("N = 21 ends in a final of 3, as decided (2G7)", () => {
    const d = drawFor(21);
    expect(d.rounds.map((r) => r.id)).toEqual(["R1", "R2", "F"]);
    expect(round(d, "F").heats[0].slots).toHaveLength(3);
  });

  it("the heat count for each N (what the two-day timetable must hold; finding A1a-2)", () => {
    expect([24, 23, 22, 21, 20].map((n) => [n, heatTotal(drawFor(n)), sizes(drawFor(n)).split(" ")[0]])).toEqual([
      [24, 15, "R1:3,3,3,3,3,3,3,3"],
      [23, 19, "R1:2,2,2,2,2,2,2,2,2,2,3"],
      [22, 19, "R1:2,2,2,2,2,2,2,2,2,2,2"],
      [21, 11, "R1:3,3,3,3,3,3,3"],
      [20, 18, "R1:2,2,2,2,2,2,2,2,2,2"],
    ]);
  });

  it.fails("A1a-2: one withdrawal before lock (24 → 23) should not turn Round 1 into 1 v 1 heats and add 4 heats to the event", () => {
    const d = drawFor(23);
    expect(heatTotal(d)).toBeLessThanOrEqual(15);
    expect(round(d, "R1").heats.filter((h) => h.slots.length === 2).length).toBeLessThanOrEqual(1);
  });

  it("after the draw is locked a withdrawal is a DNS walkover: 15 heats stay, the heat of 3 runs with 2", () => {
    const locked = withdrawEntrant(lockDraw(drawFor(24)), "r5");
    expect(heatTotal(locked)).toBe(15);
    const h = round(locked, "R1").heats.find((x) => x.slots.some((s) => s.entrantId === "r5"))!;
    expect(h.slots.find((s) => s.entrantId === "r5")?.modifier).toBe("DNS");
    expect(heatCanRun(locked, h.id)).toBe(true);
    const done = publishAll(locked, randomScore(3));
    expect(divisionPlacings(done)).toHaveLength(24);
    expect(divisionPlacings(done).find((p) => p.entrantId === "r5")?.place).not.toBe(1);
  });

  it("publishing heat by heat in any order seats each winner at once and gives the same R2 as publishing R1 together", () => {
    const d = drawFor(24);
    const ids = round(d, "R1").heats.map((h) => h.id);
    const shuffled = [...ids].sort((a, b) => randomScore(9)(1, a) - randomScore(9)(1, b));
    const stepwise = shuffled.reduce((x, id) => publish(x, id, randomScore(5)), d);
    const together = ids.reduce((x, id) => publish(x, id, randomScore(5)), d);
    expect(round(stepwise, "R2").heats.map((h) => h.slots.map((s) => s.entrantId))).toEqual(round(together, "R2").heats.map((h) => h.slots.map((s) => s.entrantId)));
    expect(heat(stepwise, "R2-H1").slots.every((s) => s.entrantId)).toBe(true);
  });
});

// ── the custom ladder checker ─────────────────────────────────────────────────────────────────────────────────────
const riders = (n: number): RiderRef[] => makeEntrants(n).map((e) => ({ id: e.id, name: e.name }));
const ALL_FAULTS: FaultCode[] = ["no_rounds", "first_round_seats", "round_receives", "place_twice", "seed_twice", "rider_twice", "seed_unknown", "rider_unknown", "seed_outside_first", "place_unknown", "place_not_advancing", "depends_later", "heat_under_min", "heat_over_max", "final_small", "advance_nowhere", "heat_empty", "seat_empty", "routing_mixed"];

/** A raw ladder (as it could come back from storage), validated by the schema only. */
const raw = (rounds: Array<{ id: string; advance?: number; heats: Array<Array<Record<string, unknown>>> }>, limits = { targetHeatSize: 3, minHeatSize: 3, maxHeatSize: 3 }): CustomLadder =>
  CustomLadderSchema.parse({ ...limits, rounds: rounds.map((r) => ({ id: r.id, name: `Round ${r.id}`, shortName: r.id, advance: r.advance ?? 1, heats: r.heats.map((seats) => ({ seats })) })) });
const seed = (n: number) => ({ type: "seed", seed: n });
const place = (round: string, h: number, p: number) => ({ type: "place", round, heat: h, place: p });

describe("Audit 1a · custom ladder checker · flags every fault it documents, never throws, never blocks editing", () => {
  const generated = drawToLadder(drawFor(24));

  it("the generated Gouna ladder (24) loads into the builder with a green checker: 15 heats, 24 riders", () => {
    const c = checkLadder(generated, riders(24));
    expect(c.faults).toEqual([]);
    expect(c.status).toBe("Ladder complete — 15 heats, 24 riders, every place accounted for");
  });

  it("each of the 19 documented fault codes is raised by a ladder built to have it", () => {
    const cases: Array<[FaultCode, CustomLadder, number]> = [
      ["no_rounds", raw([]), 3],
      ["first_round_seats", raw([{ id: "R1", heats: [[seed(1), seed(2), seed(3)]] }]), 4],
      ["round_receives", raw([{ id: "R1", heats: [[seed(1), seed(2), seed(3)], [seed(4), seed(5), seed(6)]] }, { id: "F", advance: 0, heats: [[place("R1", 1, 1), place("R1", 2, 1), { type: "empty" }]] }]), 6],
      ["place_twice", raw([{ id: "R1", heats: [[seed(1), seed(2), seed(3)], [seed(4), seed(5), seed(6)]] }, { id: "F", advance: 0, heats: [[place("R1", 1, 1), place("R1", 1, 1)]] }]), 6],
      ["seed_twice", raw([{ id: "R1", heats: [[seed(1), seed(1), seed(3)]] }]), 3],
      ["rider_twice", raw([{ id: "R1", heats: [[seed(1), { type: "rider", entrantId: "r1" }, seed(3)]] }]), 3],
      ["seed_unknown", raw([{ id: "R1", heats: [[seed(1), seed(2), seed(9)]] }]), 3],
      ["rider_unknown", raw([{ id: "R1", heats: [[seed(1), seed(2), { type: "rider", entrantId: "nobody" }]] }]), 3],
      ["seed_outside_first", raw([{ id: "R1", heats: [[seed(1), seed(2), seed(3)]] }, { id: "F", advance: 0, heats: [[place("R1", 1, 1), seed(3)]] }]), 3],
      ["place_unknown", raw([{ id: "R1", heats: [[seed(1), seed(2), seed(3)]] }, { id: "F", advance: 0, heats: [[place("R1", 1, 1), place("R1", 4, 1)]] }]), 3],
      ["place_not_advancing", raw([{ id: "R1", heats: [[seed(1), seed(2), seed(3)]] }, { id: "F", advance: 0, heats: [[place("R1", 1, 1), place("R1", 1, 2)]] }]), 3],
      ["depends_later", raw([{ id: "R1", heats: [[seed(1), seed(2), seed(3)]] }, { id: "R2", heats: [[place("F", 1, 1), place("R1", 1, 1)]] }, { id: "F", advance: 0, heats: [[place("R2", 1, 1), place("R1", 1, 1)]] }]), 3],
      ["heat_under_min", raw([{ id: "R1", heats: [[seed(1), seed(2)]] }]), 2],
      ["heat_over_max", raw([{ id: "R1", heats: [[seed(1), seed(2), seed(3), seed(4)]] }]), 4],
      ["final_small", raw([{ id: "R1", heats: [[seed(1), seed(2), seed(3)]] }, { id: "F", advance: 0, heats: [[place("R1", 1, 1)]] }]), 3],
      ["advance_nowhere", raw([{ id: "R1", advance: 0, heats: [[seed(1), seed(2), seed(3)]] }, { id: "F", advance: 0, heats: [[{ type: "empty" }, { type: "empty" }]] }]), 3],
      ["heat_empty", raw([{ id: "R1", heats: [[{ type: "empty" }, { type: "empty" }, { type: "empty" }]] }]), 3],
      ["seat_empty", raw([{ id: "R1", heats: [[seed(1), seed(2), { type: "empty" }]] }]), 3],
      ["routing_mixed", raw([{ id: "R1", heats: [[seed(1), seed(2), seed(3)], [seed(4), seed(5), seed(6)], [seed(7), seed(8), seed(9)]] }, { id: "R2", heats: [[place("R1", 1, 1), place("R1", 2, 1)]] }, { id: "F", advance: 0, heats: [[place("R2", 1, 1), place("R1", 3, 1)]] }]), 9],
    ];
    const raised = new Set<FaultCode>();
    for (const [code, l, n] of cases) {
      const c = checkLadder(l, riders(n));
      expect(c.faults.map((f) => f.code), code).toContain(code);
      expect(c.complete, code).toBe(false);
      raised.add(code);
    }
    expect([...raised].sort()).toEqual([...ALL_FAULTS].sort());
  });

  it("500 random ladders (random edits, then random raw seats): the checker never throws and answers every time", () => {
    let checked = 0;
    for (let s = 1; s <= 500; s++) {
      const r = (k: number) => randomScore(s)(k, "x") % 1000;
      let l: CustomLadder = newLadder(3, 3, 3);
      const n = 18 + (r(1) % 9);
      for (let k = 0; k < 2 + (r(2) % 3); k++) l = addRound(l);
      for (const [i, rd] of l.rounds.entries()) {
        for (let h = 0; h < 1 + (r(10 + i) % 8); h++) l = addHeat(l, rd.id, 1 + (r(20 + i + h) % 4));
      }
      l = fillSeats(l, riders(n));
      for (let k = 0; k < 12; k++) {
        const rd = l.rounds[r(30 + k) % l.rounds.length];
        try {
          const op = r(40 + k) % 4;
          if (op === 0) l = setAdvance(l, rd.id, r(50 + k) % 4);
          else if (op === 1 && rd.heats.length) l = setSeatCount(l, rd.id, 1 + (r(60 + k) % rd.heats.length), r(70 + k) % 5);
          else if (op === 2 && rd.heats[0]?.seats.length) l = setSeat(l, { round: rd.id, heat: 1, seat: 0 }, { type: "seed", seed: 1 + (r(80 + k) % 30) });
          else l = addHeat(l, rd.id);
        } catch (e) {
          expect(e, `seed ${s}: an edit may only refuse with a LadderEditError`).toBeInstanceOf(LadderEditError);
        }
      }
      const c = checkLadder(l, riders(n));
      expect(typeof c.status).toBe("string");
      expect(c.complete).toBe(c.faults.length === 0);
      checked++;
    }
    expect(checked).toBe(500);
  });
});
