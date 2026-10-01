// Phase 4b — hands-on editing of a draw: drag/tap, hand-place, clear, add and remove heats and rounds, rename, audit sentences,
// whole-ladder warnings (warn, never block), hand-arranged marks and a regenerate that leaves them alone.
import { describe, expect, it } from "vitest";
import { applyDrawEdit, arrangedParts, checkDraw, DrawEditError, heatLabel, regenerateKeeping, ridersInRound, type DrawEdit } from "./draw-edit";
import { bySeed, heat, loadFormat, makeEntrants, publish, publishRound, round } from "./fixtures";
import { expandFormat, setHeatStatus } from "./index";
import type { DivisionDraw } from "./types";

/** The owner's real event: 24 riders, Knockout, 3 / 3 / 3, 1 advances, final of 2, by original seeding: 15 heats. */
function knockout24(): DivisionDraw {
  const template = loadFormat("heats4-top2-single-elim", (j) => {
    j.generator.params = { ...j.generator.params, heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2, reseed: "by_original_seed" };
  });
  const entrants = makeEntrants(24).map((e) => ({ ...e, name: ["Amr", "Sam", "Lena"][Number(e.id.slice(1)) % 3] + ` ${e.id.slice(1)}` }));
  return expandFormat(template, entrants, { identification: "name-callout" });
}

const edit = (draw: DivisionDraw, e: DrawEdit) => applyDrawEdit(draw, e);

describe("the generated draw is the starting point", () => {
  it("24 riders: four columns of 8, 4, 2 and 1 heats = 15 heats; later rounds show placeholders; nothing to warn about", () => {
    const d = knockout24();
    expect(d.rounds.map((r) => r.heats.length)).toEqual([8, 4, 2, 1]);
    expect(d.rounds.flatMap((r) => r.heats).length).toBe(15);
    expect(round(d, "R2").heats[0].slots.map((s) => s.from)).toEqual([{ round: "R1", heat: 1, place: 1 }, { round: "R1", heat: 2, place: 1 }]);
    expect(checkDraw(d)).toEqual([]);
  });
});

describe("moving riders: drag or tap, swap when the seat is taken", () => {
  it("a rider dropped on a taken seat swaps with that rider; both heats are marked hand-arranged", () => {
    const d = knockout24();
    const a = heat(d, "R1-H1").slots[0];
    const b = heat(d, "R1-H2").slots[1];
    const { draw, summary } = edit(d, { op: "move", from: { heatId: "R1-H1", slot: 0 }, to: { heatId: "R1-H2", slot: 1 } });
    expect(heat(draw, "R1-H1").slots[0].entrantId).toBe(b.entrantId);
    expect(heat(draw, "R1-H2").slots[1].entrantId).toBe(a.entrantId);
    expect(heat(draw, "R1-H1").manualOverride && heat(draw, "R1-H2").manualOverride).toBe(true);
    expect(heat(draw, "R1-H3").manualOverride).toBe(false);
    expect(summary).toMatch(/^Swapped .* \(Heat 1\) with .* \(Heat 2\)$/);
    expect(checkDraw(draw)).toEqual([]);
  });

  it("the original draw is never changed (pure)", () => {
    const d = knockout24();
    const before = JSON.stringify(d);
    edit(d, { op: "move", from: { heatId: "R1-H1", slot: 0 }, to: { heatId: "R1-H2", slot: 1 } });
    expect(JSON.stringify(d)).toBe(before);
  });

  it("a rider moved to an empty seat leaves his or her old seat empty, and the check says so", () => {
    let d = knockout24().rounds.length ? knockout24() : knockout24();
    d = edit(d, { op: "clear", heatId: "R1-H2", slot: 0 }).draw;
    const { draw } = edit(d, { op: "move", from: { heatId: "R1-H1", slot: 2 }, to: { heatId: "R1-H2", slot: 0 } });
    expect(heat(draw, "R1-H1").slots[2].entrantId).toBeUndefined();
    const messages = checkDraw(draw).map((w) => w.message);
    expect(messages).toContain("Heat 1 has an empty seat (seat 3).");
  });

  it("there has to be somebody in the seat you move, and it cannot be moved onto itself", () => {
    const d = edit(knockout24(), { op: "clear", heatId: "R1-H1", slot: 0 }).draw;
    expect(() => edit(d, { op: "move", from: { heatId: "R1-H1", slot: 0 }, to: { heatId: "R1-H2", slot: 0 } })).toThrow(/nobody/);
    expect(() => edit(knockout24(), { op: "move", from: { heatId: "R1-H1", slot: 0 }, to: { heatId: "R1-H1", slot: 0 } })).toThrow(DrawEditError);
  });
});

describe("hand-placing and clearing", () => {
  it("a rider can be put into any seat; the same rider in two heats is warned about, not blocked", () => {
    const d = knockout24();
    const amr = heat(d, "R1-H1").slots[0].entrantId!;
    const { draw, summary } = edit(d, { op: "place", heatId: "R1-H5", slot: 1, entrantId: amr });
    expect(heat(draw, "R1-H5").slots[1]).toMatchObject({ entrantId: amr, manual: true });
    expect(summary).toMatch(/^Placed .* in Heat 5, seat 2 \(replacing /);
    const name = d.entrants.find((e) => e.id === amr)!.name;
    const messages = checkDraw(draw).map((w) => w.message);
    expect(messages).toContain(`${name} is in two heats of Round 1.`);
    // the rider who was replaced has no heat now
    expect(messages.some((m) => m.endsWith("has no heat in Round 1."))).toBe(true);
  });

  it("a rider can be put into a seat that still waits for a result ('1st H1'); a published result never overwrites it", () => {
    const d = knockout24();
    const rider = heat(d, "R1-H1").slots[0].entrantId!;
    const placed = edit(d, { op: "place", heatId: "R2-H1", slot: 0, entrantId: rider });
    expect(heat(placed.draw, "R2-H1").slots[0]).toMatchObject({ entrantId: rider, manual: true, from: { round: "R1", heat: 1, place: 1 } });
    expect(round(placed.draw, "R2")).toMatchObject({ arranged: true, explicit: true });
    // heat 1 is published and somebody else wins it: the hand-placed seat stays as it was
    let after = publishRound(placed.draw, "R1", (seed) => 100 - seed);
    expect(heat(after, "R2-H1").slots[0].entrantId).toBe(rider);
    // the other seat is filled by the result that names it
    expect(heat(after, "R2-H1").slots[1].entrantId).toBeDefined();
    after = publish(after, "R2-H1");
    expect(heat(after, "R2-H1").status).toBe("published");
  });

  it("a seat can be told to wait for any earlier place: '1st R1 H3'", () => {
    const d = knockout24();
    const { draw, summary } = edit(d, { op: "setPlace", heatId: "R2-H1", slot: 0, from: { round: "R1", heat: 3, place: 1 } });
    expect(heat(draw, "R2-H1").slots[0].from).toEqual({ round: "R1", heat: 3, place: 1 });
    expect(summary).toBe("Seat 1 of Heat 9 now waits for 1st H3");
    expect(() => edit(d, { op: "setPlace", heatId: "R1-H1", slot: 0, from: { round: "R2", heat: 1, place: 1 } })).toThrow(/earlier round/);
    expect(() => edit(d, { op: "setPlace", heatId: "R2-H1", slot: 0, from: { round: "R1", heat: 1, place: 5 } })).toThrow(/no 5th place/);
  });

  it("clearing a seat leaves it empty and says what it held", () => {
    const d = knockout24();
    const { draw, summary } = edit(d, { op: "clear", heatId: "R2-H1", slot: 1 });
    expect(heat(draw, "R2-H1").slots[1]).toEqual({ index: 1 });
    expect(summary).toBe("Cleared seat 2 of Heat 9 (it held 1st H2)");
    expect(checkDraw(draw).map((w) => w.message)).toContain("Heat 9 has an empty seat (seat 2).");
  });

  it("a withdrawn rider cannot be placed", () => {
    const d = knockout24();
    d.entrants[5].withdrawn = true;
    expect(() => edit(d, { op: "place", heatId: "R1-H1", slot: 0, entrantId: d.entrants[5].id })).toThrow(/withdrawn/);
  });
});

describe("adding and removing seats, heats and rounds", () => {
  it("an extra seat makes the heat too big and the round too full: both warned", () => {
    const { draw } = edit(knockout24(), { op: "addSeat", heatId: "R1-H3" });
    const m = checkDraw(draw).map((w) => w.message);
    expect(m).toContain("Heat 3 has 4 riders, maximum is 3.");
    expect(m).toContain("Round 1 expects 24 riders, 25 placed.");
  });

  it("taking a seat out reindexes the colours and marks the round as arranged", () => {
    const { draw } = edit(knockout24(), { op: "removeSeat", heatId: "R1-H3", slot: 1 });
    expect(heat(draw, "R1-H3").slots.map((s) => s.index)).toEqual([0, 1]);
    expect(checkDraw(draw).map((w) => w.message)).toContain("Heat 3 has 2 riders, minimum is 3.");
  });

  it("a heat cannot lose its last seat", () => {
    let d = knockout24();
    d = edit(d, { op: "removeSeat", heatId: "R2-H1", slot: 1 }).draw;
    expect(() => edit(d, { op: "removeSeat", heatId: "R2-H1", slot: 0 })).toThrow(/at least one seat/);
  });

  it("an extra heat in a round: new heat, empty seats, next number; the later round now expects more riders", () => {
    const d = knockout24();
    const { draw, summary } = edit(d, { op: "addHeat", roundId: "R1" });
    const added = round(draw, "R1").heats[8];
    expect(added).toMatchObject({ id: "R1-H9", status: "pending", manualOverride: true });
    expect(added.slots).toHaveLength(3);
    expect(summary).toBe("Added a heat to Round 1 (Heat 9, 3 seats)");
    // numbering stays tidy before anything has started
    expect(round(draw, "R2").heats[0].number).toBe(10);
    const m = checkDraw(draw).map((w) => w.message);
    expect(m).toContain("Round 1 expects 24 riders, 27 placed.");
    expect(m).toContain("Round 2 expects 9 riders, 8 placed.");
    expect(m.filter((x) => x.includes("empty seat"))).toHaveLength(3);
  });

  it("once a heat has started, numbers never change: an extra heat takes the next free number", () => {
    let d = setHeatStatus(knockout24(), "R1-H1", "running");
    d = edit(d, { op: "addHeat", roundId: "R1" }).draw;
    expect(round(d, "R1").heats[8].number).toBe(16);
    expect(round(d, "R2").heats[0].number).toBe(9);
  });

  it("taking a heat out renumbers the heats behind it and empties the seats that waited for it", () => {
    const d = knockout24();
    const { draw, summary } = edit(d, { op: "removeHeat", heatId: "R1-H2" });
    expect(round(draw, "R1").heats.map((h) => h.id)).toEqual(["R1-H1", "R1-H2", "R1-H3", "R1-H4", "R1-H5", "R1-H6", "R1-H7"]);
    expect(round(draw, "R1").heats.map((h) => h.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(summary).toMatch(/^Took Heat 2 out of Round 1 \(.*now have no heat in it\)$/);
    // R2-H1 waited for 1st H1 and 1st H2: H2 is gone, H3 became H2 and the seat follows it
    expect(heat(draw, "R2-H1").slots.map((s) => s.from?.heat ?? 0)).toEqual([1, 0]);
    expect(heat(draw, "R2-H2").slots.map((s) => s.from?.heat)).toEqual([2, 3]);
    const m = checkDraw(draw).map((w) => w.message);
    expect(m.filter((x) => x.endsWith("has no heat in Round 1."))).toHaveLength(3);
    expect(m).toContain("Round 1 expects 24 riders, 21 placed.");
  });

  it("a heat cannot be taken out when a later heat of the round has started", () => {
    const d = setHeatStatus(knockout24(), "R1-H5", "published");
    expect(() => edit(d, { op: "removeHeat", heatId: "R1-H2" })).toThrow(/later heat/);
  });

  it("an added round is empty until it has heats, and an empty round can be taken out again", () => {
    const d = knockout24();
    const { draw } = edit(d, { op: "addRound", afterRoundId: "R2", name: "Wildcard" });
    expect(draw.rounds.map((r) => r.name)).toEqual(["Round 1", "Round 2", "Wildcard", "Semi-finals", "Final"]);
    expect(checkDraw(draw).map((w) => w.message)).toContain("Wildcard is empty.");
    expect(() => edit(draw, { op: "removeRound", roundId: "R1" })).toThrow(/still has heats/);
    const gone = edit(draw, { op: "removeRound", roundId: draw.rounds[2].id }).draw;
    expect(gone.rounds).toHaveLength(4);
  });

  it("a new round can get heats and seats that wait for places, and then runs end to end", () => {
    let d = knockout24();
    d = edit(d, { op: "addRound", afterRoundId: "F", name: "Super final" }).draw;
    const id = d.rounds[4].id;
    d = edit(d, { op: "addHeat", roundId: id }).draw;
    expect(round(d, id).heats[0].slots).toHaveLength(2);
    d = edit(d, { op: "setPlace", heatId: `${id}-H1`, slot: 0, from: { round: "F", heat: 1, place: 1 } }).draw;
    d = edit(d, { op: "setPlace", heatId: `${id}-H1`, slot: 1, from: { round: "F", heat: 1, place: 2 } }).draw;
    let p = d;
    for (const r of ["R1", "R2", "SF", "F"]) p = publishRound(p, r);
    // the two finalists (first and second place of the Final, the lower seed wins every heat) take the two seats that wait for them
    const finalists = heat(p, "F-H1").slots.map((s) => s.entrantId!).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    expect(heat(p, `${id}-H1`).slots.map((s) => s.entrantId)).toEqual(finalists);
  });
});

describe("names", () => {
  it("rename a round or a heat; a blank name goes back to the default; the name is kept in the template", () => {
    let d = knockout24();
    d = edit(d, { op: "renameHeat", heatId: "R1-H1", name: "Opening heat" }).draw;
    d = edit(d, { op: "renameRound", roundId: "R1", name: "Qualifying" }).draw;
    expect(heat(d, "R1-H1").name).toBe("Opening heat");
    expect(round(d, "R1").name).toBe("Qualifying");
    expect(d.template.heatNames).toEqual({ "R1-H1": "Opening heat" });
    expect(heatLabel(heat(d, "R1-H1"))).toBe("Opening heat");
    d = edit(d, { op: "renameHeat", heatId: "R1-H1", name: "  " }).draw;
    expect(heat(d, "R1-H1").name).toBeUndefined();
    expect(d.template.heatNames).toBeUndefined();
    expect(() => edit(d, { op: "renameRound", roundId: "R1", name: "x".repeat(41) })).toThrow(/40/);
  });

  it("heats that have started can still be renamed, but nothing else", () => {
    const d = setHeatStatus(knockout24(), "R1-H1", "running");
    expect(edit(d, { op: "renameHeat", heatId: "R1-H1", name: "Live one" }).draw.rounds[0].heats[0].name).toBe("Live one");
    for (const e of [
      { op: "move", from: { heatId: "R1-H1", slot: 0 }, to: { heatId: "R1-H2", slot: 0 } },
      { op: "move", from: { heatId: "R1-H2", slot: 0 }, to: { heatId: "R1-H1", slot: 0 } },
      { op: "clear", heatId: "R1-H1", slot: 0 },
      { op: "place", heatId: "R1-H1", slot: 0, entrantId: "r2" },
      { op: "addSeat", heatId: "R1-H1" },
      { op: "removeSeat", heatId: "R1-H1", slot: 0 },
      { op: "removeHeat", heatId: "R1-H1" },
    ] as DrawEdit[]) {
      expect(() => edit(d, e)).toThrow(/already started or finished/);
    }
  });
});

describe("hand-arranged heats and a regenerate that leaves them alone", () => {
  it("the arranged heats and rounds are listed by name for the confirmation", () => {
    let d = knockout24();
    expect(arrangedParts(d)).toEqual({ heats: [], rounds: [] });
    d = edit(d, { op: "move", from: { heatId: "R1-H1", slot: 0 }, to: { heatId: "R1-H2", slot: 1 } }).draw;
    d = edit(d, { op: "addHeat", roundId: "R2" }).draw;
    const parts = arrangedParts(d);
    expect(parts.heats.map((h) => h.heatId)).toEqual(["R1-H1", "R1-H2", "R2-H5"]);
    expect(parts.rounds).toEqual([{ roundId: "R2", name: "Round 2" }]);
  });

  it("regenerate keeping: a hand-arranged heat of Round 1 is copied over and every rider still has exactly one heat", () => {
    const old = edit(knockout24(), { op: "move", from: { heatId: "R1-H1", slot: 0 }, to: { heatId: "R1-H2", slot: 1 } }).draw;
    const fresh = knockout24();
    const { draw, kept, dropped } = regenerateKeeping(old, fresh);
    expect(kept.sort()).toEqual(["Heat 1", "Heat 2"]);
    expect(dropped).toEqual([]);
    expect(heat(draw, "R1-H1").slots.map((s) => s.entrantId)).toEqual(heat(old, "R1-H1").slots.map((s) => s.entrantId));
    expect(heat(draw, "R1-H2").slots.map((s) => s.entrantId)).toEqual(heat(old, "R1-H2").slots.map((s) => s.entrantId));
    const all = round(draw, "R1").heats.flatMap((h) => h.slots.map((s) => s.entrantId));
    expect(new Set(all).size).toBe(24);
    expect(checkDraw(draw)).toEqual([]);
  });

  it("an arranged heat that cannot be kept (its riders left the field or it no longer exists) is listed, never silently dropped", () => {
    const old = edit(knockout24(), { op: "move", from: { heatId: "R1-H1", slot: 0 }, to: { heatId: "R1-H2", slot: 1 } }).draw;
    const template = old.template;
    const entrants = makeEntrants(24).map((e, i) => (i === 0 ? { ...e, withdrawn: true } : e));
    const fresh = expandFormat(template, entrants, { identification: "name-callout" });
    const { dropped, kept } = regenerateKeeping(old, fresh);
    expect(kept.length + dropped.length).toBe(2);
    expect(dropped.length).toBeGreaterThan(0);
  });
});

describe("listing riders for the hand-place list", () => {
  it("shows where each rider sits, and the rider who has no heat", () => {
    const d = edit(knockout24(), { op: "clear", heatId: "R1-H1", slot: 0 }).draw;
    const list = ridersInRound(d, "R1");
    expect(list).toHaveLength(24);
    expect(list.filter((r) => r.heats.length === 0)).toHaveLength(1);
    expect(list.find((r) => r.entrantId === "r1")?.heats).toEqual([]);
  });
});

describe("a draw that was edited still publishes, and the results still reach the seats", () => {
  it("swapping two riders of Round 1 by hand, then publishing Round 1: winners reach Round 2 as before", () => {
    let d = edit(knockout24(), { op: "move", from: { heatId: "R1-H1", slot: 0 }, to: { heatId: "R1-H2", slot: 0 } }).draw;
    d = publishRound(d, "R1", bySeed);
    expect(round(d, "R2").heats.flatMap((h) => h.slots.map((s) => s.entrantId))).toHaveLength(8);
    expect(round(d, "R2").heats.flatMap((h) => h.slots).every((s) => s.entrantId)).toBe(true);
  });
});
