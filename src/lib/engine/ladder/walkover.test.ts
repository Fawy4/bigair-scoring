// Console – Walkover and absent riders (0.19.0). Pure ladder rules: who can ride, the result of a heat that is not ridden, what a rider who did not start keeps,
// and where a walkover winner sits when a round is dealt by score.
import { describe, expect, it } from "vitest";
import { expandFormat } from "./expand";
import { heat, loadFormat, makeEntrants, publish, publishRound, round, seeds } from "./fixtures";
import { orderArrivals } from "./build";
import { divisionPlacings } from "./placings";
import { applyHeatResult, lockDraw, withdrawEntrant } from "./progress";
import { heatCanWalkover, walkoverRanking } from "./walkover";
import type { DivisionDraw, LadderModifier } from "./types";

const seat = (entrantId: string | undefined, modifier?: LadderModifier) => ({ ...(entrantId ? { entrantId } : {}), ...(modifier ? { modifier } : {}) });

describe("who can ride, and when a heat is a walkover", () => {
  it("two riders, one did not start: a walkover for the other", () => {
    expect(heatCanWalkover([seat("a"), seat("b", "DNS")])).toEqual({ kind: "walkover", winner: "a", others: ["b"] });
  });
  it("a heat of three with one missing is NOT a walkover: it runs with two", () => {
    expect(heatCanWalkover([seat("a"), seat("b", "DNS"), seat("c")]).kind).toBe("ride");
  });
  it("a heat of three with two missing is a walkover for the third", () => {
    expect(heatCanWalkover([seat("a"), seat("b", "DNS"), seat("c", "DNS")])).toEqual({ kind: "walkover", winner: "a", others: ["b", "c"] });
  });
  it("nobody left: every rider did not start or is out of the event", () => {
    expect(heatCanWalkover([seat("a", "DNS"), seat("b", "DNS")])).toEqual({ kind: "nobody", others: ["a", "b"] });
  });
  it("a seat with no rider and no walkover mark is still waiting for a result: nothing can be decided yet", () => {
    expect(heatCanWalkover([seat("a"), seat(undefined)]).kind).toBe("waiting");
    expect(heatCanWalkover([seat("a"), seat(undefined, "DNS")])).toEqual({ kind: "walkover", winner: "a", others: [] });
  });
  it("a disqualified rider cannot ride either", () => {
    expect(heatCanWalkover([seat("a"), seat("b", "DSQ")]).kind).toBe("walkover");
  });
});

describe("the result of a heat that is not ridden", () => {
  it("the rider who can ride is 1st with no total and the walkover mark; the others follow as Did not start", () => {
    const r = walkoverRanking([seat("a"), seat("b", "DNS"), seat("c", "DNS")]);
    expect(r.ranked).toEqual([
      { entrantId: "a", place: 1, total: null, walkover: true, tieKeys: [] },
      { entrantId: "b", place: 2, total: null, modifier: "DNS" },
      { entrantId: "c", place: 3, total: null, modifier: "DNS" },
    ]);
  });
  it("nobody left: nobody is ranked, so nobody goes through", () => {
    expect(walkoverRanking([seat("a", "DNS"), seat("b", "DNS")]).ranked).toEqual([]);
  });
  it("refuses a heat that can still be ridden", () => {
    expect(() => walkoverRanking([seat("a"), seat("b")])).toThrow(/only one rider/i);
  });
});

/** Knockout with a second chance, 12 riders (heats of 3). R1 is ridden by seed so every R1 heat is published. */
function afterRound1(): DivisionDraw {
  let d = lockDraw(expandFormat(loadFormat("kota-dingle"), makeEntrants(12)));
  d = publishRound(d, "R1");
  return d;
}

describe("a walkover in the ladder (Knockout with a second chance, 12 riders)", () => {
  it("the walkover winner takes the seat the heat feeds, exactly as after a normal publish", () => {
    let d = afterRound1();
    const oneVsOne = round(d, "R2").heats.find((h) => h.slots.length === 2)!;
    const [a, b] = oneVsOne.slots.map((s) => s.entrantId!);
    const res = applyHeatResult(d, oneVsOne.id, walkoverRanking([seat(a), seat(b, "DNS")]));
    expect(res.conflict).toBeUndefined();
    d = res.draw;
    expect(heat(d, oneVsOne.id).status).toBe("published");
    expect(round(d, "R3").heats.flatMap((h) => h.slots.map((s) => s.entrantId))).toContain(undefined); // the other R2 heats are not published yet
    expect(round(d, "R3").arrivals.some((x) => x.entrantId === a && x.place === 1 && x.total === null)).toBe(true);
    expect(round(d, "R3").arrivals.some((x) => x.entrantId === b)).toBe(false); // the rider who did not start is out of this heat: not in R3
  });

  it("Did not start is this heat only: in Round 1 he still gets his Round 2 heat", () => {
    const d0 = lockDraw(expandFormat(loadFormat("kota-dingle"), makeEntrants(12)));
    const h = heat(d0, "R1-H1");
    const [w, x, y] = h.slots.map((s) => s.entrantId!);
    let d = applyHeatResult(d0, h.id, { ranked: [{ entrantId: w, place: 1, total: 50, tieKeys: [] }, { entrantId: y, place: 2, total: 30, tieKeys: [] }, { entrantId: x, place: 3, total: null, modifier: "DNS" }] }).draw;
    for (const id of ["R1-H2", "R1-H3", "R1-H4"]) d = publish(d, id);
    const r2 = round(d, "R2").heats.flatMap((hh) => hh.slots);
    const seatOfX = r2.find((s) => s.entrantId === x);
    expect(seatOfX).toBeDefined();
    expect(seatOfX!.modifier).toBeUndefined(); // a real seat: he rides
  });

  it("Out of the event: every seat he would fill, second-chance heats included, is a walkover for the others", () => {
    let d = lockDraw(expandFormat(loadFormat("kota-dingle"), makeEntrants(12)));
    const h = heat(d, "R1-H1");
    const out = h.slots[1].entrantId!;
    d = withdrawEntrant(d, out);
    expect(heat(d, "R1-H1").slots[1].modifier).toBe("DNS");
    d = publish(d, "R1-H1");
    for (const id of ["R1-H2", "R1-H3", "R1-H4"]) d = publish(d, id);
    const seatOfOut = round(d, "R2").heats.flatMap((hh) => hh.slots).find((s) => s.entrantId === out);
    expect(seatOfOut?.modifier).toBe("DNS");
  });

  it("a rider who is Out of the event takes the shared place of the round he left, like a rider knocked out there", () => {
    let d = lockDraw(expandFormat(loadFormat("kota-dingle"), makeEntrants(12)));
    const out = heat(d, "R1-H1").slots[1].entrantId!;
    d = withdrawEntrant(d, out);
    d = publishRound(d, "R1");
    const r2 = round(d, "R2");
    // every R2 heat: the rider who can ride goes through when the other is out
    for (const hh of r2.heats) {
      const ride = hh.slots.filter((s) => s.entrantId && s.modifier !== "DNS");
      if (hh.slots.length - ride.length > 0 && ride.length === 1) {
        d = applyHeatResult(d, hh.id, walkoverRanking(hh.slots.map((s) => seat(s.entrantId, s.modifier)))).draw;
      } else d = publish(d, hh.id);
    }
    const p = divisionPlacings(d).find((x) => x.entrantId === out);
    expect(p).toBeDefined();
    expect(p!.round).toBe("R2");
  });

  it("nobody left in a heat: the result is empty, nobody goes through and the seat it feeds is a walkover", () => {
    let d = afterRound1();
    const hh = round(d, "R2").heats.find((x) => x.slots.length === 2)!;
    const res = applyHeatResult(d, hh.id, walkoverRanking(hh.slots.map((s) => seat(s.entrantId, "DNS"))));
    expect(res.conflict).toBeUndefined();
    d = res.draw;
    expect(d.results[hh.id].ranked).toEqual([]);
    expect(heat(d, hh.id).status).toBe("published");
  });
});

describe("rounds dealt by score: a walkover winner counts as a 1st place below every 1st place with a score", () => {
  it("in the next round he is dealt after every scored winner", () => {
    let d = afterRound1();
    const r2 = round(d, "R2").heats;
    const wo = r2.find((x) => x.slots.length === 2)!;
    const [a, b] = wo.slots.map((s) => s.entrantId!);
    d = applyHeatResult(d, wo.id, walkoverRanking([seat(a), seat(b, "DNS")])).draw;
    for (const hh of round(d, "R2").heats) if (hh.id !== wo.id) d = publish(d, hh.id, () => 1); // every other R2 winner has a (low) score
    const r3 = round(d, "R3");
    const order = r3.heats.flatMap((hh) => hh.slots.map((s) => s.entrantId));
    expect(order).toContain(a);
    // the walkover winner has no score: among the riders whose last result was 1st place he is the last one dealt
    const seeded = orderArrivals(r3.arrivals, r3.spec.reseed).filter((x) => x.place === 1).map((x) => x.entrantId);
    expect(seeded.at(-1)).toBe(a);
    void seeds;
  });
});
