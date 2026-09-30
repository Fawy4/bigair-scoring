// Doc 08 §2F — progression, walkovers, withdrawals, correction conflict, manual override, identification warnings.
import { describe, expect, it } from "vitest";
import { expandFormat } from "./expand";
import { heat, heatSizes, loadFormat, makeEntrants, publish, publishRound, resultBy, round, seeds, shape } from "./fixtures";
import { applyHeatResult, heatCanRun, lockDraw, manualMove, seedNow, setHeatStatus, unpublishHeat, withdrawEntrant } from "./progress";

const kota = () => loadFormat("kota-dingle");
const draw18 = () => expandFormat(kota(), makeEntrants(18));

describe("2F publish → pools", () => {
  it("publishing R1 Heat 2 fills the R3 pool with the winner and the R2 pool with 2nd and 3rd", () => {
    const d0 = draw18();
    const h2 = heat(d0, "R1-H2");
    expect(h2.slots.map((s) => s.seed)).toEqual([2, 11, 14]);
    const d = publish(d0, "R1-H2");
    expect(round(d, "R3").arrivals.map((a) => [a.originalSeed, a.place])).toEqual([[2, 1]]);
    expect(round(d, "R2").arrivals.map((a) => [a.originalSeed, a.place]).sort()).toEqual([[11, 2], [14, 3]]);
    expect(heat(d, "R1-H2").status).toBe("published");
    expect(d.results["R1-H2"].ranked.map((r) => r.entrantId)).toEqual(["r2", "r11", "r14"]);
  });

  it("the second-chance round is dealt only when all six R1 heats are published", () => {
    let d = draw18();
    for (const id of ["R1-H1", "R1-H2", "R1-H3", "R1-H4", "R1-H5"]) d = publish(d, id);
    expect(round(d, "R2").seeded).toBe(false);
    expect(shape(d, "R2").flat().every((s) => /^H\dp[23]$/.test(s))).toBe(true);
    d = publish(d, "R1-H6");
    expect(round(d, "R2").seeded).toBe(true);
    // 2nd places first by total (7..12), then 3rd places (13..18), snaked over 4 heats of 3.
    expect(seeds(d, "R2")).toEqual([[7, 14, 15], [8, 13, 16], [9, 12, 17], [10, 11, 18]]);
  });

  it("'Seed now' proceeds with the missing places as DNS walkovers", () => {
    let d = draw18();
    for (const id of ["R1-H1", "R1-H2", "R1-H3", "R1-H4", "R1-H5"]) d = publish(d, id);
    d = seedNow(d, "R2");
    expect(round(d, "R2").seeded).toBe(true);
    expect(round(d, "R2").seededNow).toBe(true);
    // Real riders 8..17 in score order, then the two walkovers at the bottom → they meet the top seeds.
    expect(shape(d, "R2")).toEqual([["8", "15", "16"], ["9", "14", "17"], ["10", "13", "WO"], ["11", "12", "WO"]]);
    expect(heatCanRun(d, "R2-H3")).toBe(true);
    for (const id of ["R2-H3", "R2-H4"]) {
      const wo = heat(d, id).slots[2];
      expect(wo.modifier).toBe("DNS");
      expect(wo.from).toMatchObject({ round: "R1", heat: 6 });
    }
  });

  it("a late result after 'Seed now' re-deals the round while its heats have not started", () => {
    let d = draw18();
    for (const id of ["R1-H1", "R1-H2", "R1-H3", "R1-H4", "R1-H5"]) d = publish(d, id);
    d = seedNow(d, "R2");
    d = publish(d, "R1-H6");
    expect(seeds(d, "R2")).toEqual([[7, 14, 15], [8, 13, 16], [9, 12, 17], [10, 11, 18]]);
  });

  it("does not mutate its input", () => {
    const d = draw18();
    const before = structuredClone(d);
    publish(d, "R1-H1");
    seedNow(d, "R2");
    withdrawEntrant(d, "r5");
    expect(d).toEqual(before);
  });

  it("rejects a result that does not match the heat's riders", () => {
    const d = draw18();
    expect(() => applyHeatResult(d, "R1-H1", { ranked: [{ entrantId: "r99", place: 1, total: 5 }] })).toThrow(/not in heat/);
    expect(() => applyHeatResult(d, "R1-H1", resultBy(heat(d, "R1-H2"), (s) => s))).toThrow(/not in heat/);
    expect(() => applyHeatResult(d, "NOPE", { ranked: [] })).toThrow(/no heat/i);
  });
});

describe("2F withdrawal", () => {
  it("before the draw (N 18 → 17): re-seeded into 6 heats of 2/3/3/3/3/3, heat 1 has 2 riders", () => {
    const d = withdrawEntrant(draw18(), "r18");
    expect(seeds(d, "R1")).toEqual([[1, 12], [2, 11, 13], [3, 10, 14], [4, 9, 15], [5, 8, 16], [6, 7, 17]]);
    expect(heatSizes(d, "R1")).toEqual([2, 3, 3, 3, 3, 3]);
    expect(d.entrants.find((e) => e.id === "r18")?.withdrawn).toBe(true);
  });

  it("before the draw, a middle seed leaving shifts the seeds up; riders keep their order", () => {
    const d = withdrawEntrant(draw18(), "r5");
    expect(d.seedOrder).toHaveLength(17);
    expect(d.seedOrder.slice(0, 6)).toEqual(["r1", "r2", "r3", "r4", "r6", "r7"]);
    expect(seeds(d, "R1").flat().sort((a, b) => a - b)).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
    expect(round(d, "R2").expectedEntrants).toBe(11);
  });

  it("after the draw: the slot keeps the rider with modifier DNS and the heat still runs", () => {
    const d = withdrawEntrant(lockDraw(draw18()), "r12");
    const h = heat(d, "R1-H1");
    expect(h.slots.map((s) => [s.seed, s.modifier])).toEqual([[1, undefined], [12, "DNS"], [13, undefined]]);
    expect(heatSizes(d, "R1")).toEqual([3, 3, 3, 3, 3, 3]);
    expect(heatCanRun(d, "R1-H1")).toBe(true);
    expect(d.entrants.find((e) => e.id === "r12")?.withdrawn).toBe(true);
  });

  it("a heat with only DNS riders left cannot run", () => {
    let d = lockDraw(expandFormat(loadFormat("megaloop-men-16"), makeEntrants(16)));
    d = withdrawEntrant(withdrawEntrant(d, "r1"), "r16");
    expect(heatCanRun(d, "R1-H1")).toBe(false);
  });

  it("a withdrawn rider who gets a DNS slot later is dealt as DNS and never advances", () => {
    let d = lockDraw(draw18());
    d = withdrawEntrant(d, "r12"); // would be 2nd in R1-H1
    d = publish(d, "R1-H1"); // DNS rider is ranked last by resultBy
    expect(d.results["R1-H1"].ranked.map((r) => [r.entrantId, r.modifier])).toEqual([["r1", undefined], ["r13", undefined], ["r12", "DNS"]]);
    expect(round(d, "R2").arrivals.find((a) => a.entrantId === "r12")?.modifier).toBe("DNS");
    for (const id of ["R1-H2", "R1-H3", "R1-H4", "R1-H5", "R1-H6"]) d = publish(d, id);
    const walkover = round(d, "R2").heats.flatMap((h) => h.slots).find((s) => s.entrantId === "r12");
    expect(walkover?.modifier).toBe("DNS");
    expect(round(d, "R2").heats.some((h) => h.slots.some((s) => s.entrantId === "r12"))).toBe(true);
  });
});

describe("2F correction conflict", () => {
  const upToR3 = () => {
    let d = draw18();
    d = publishRound(d, "R1");
    d = publishRound(d, "R2");
    return d;
  };
  const swapWinner = (d: ReturnType<typeof draw18>, id: string) => {
    const r = structuredClone(resultBy(heat(d, id), (s) => 100 - s));
    // 1st and 2nd swap places.
    r.ranked[0].place = 2;
    r.ranked[1].place = 1;
    r.ranked.sort((a, b) => a.place - b.place);
    return r;
  };

  it("re-publishing R1 Heat 1 with a different winner while R3 Heat 1 is running → conflict, nothing changes", () => {
    let d = upToR3();
    expect(round(d, "R3").seeded).toBe(true);
    d = setHeatStatus(d, "R3-H1", "running");
    const before = structuredClone(d);
    const res = applyHeatResult(d, "R1-H1", swapWinner(d, "R1-H1"));
    expect(res.conflict).toBeDefined();
    expect(res.conflict!.type).toBe("downstream_started");
    expect(res.conflict!.heatId).toBe("R1-H1");
    expect(res.conflict!.affectedHeats.map((h) => h.heatId)).toContain("R3-H1");
    expect(res.conflict!.affectedHeats.find((h) => h.heatId === "R3-H1")?.status).toBe("running");
    expect(res.draw).toEqual(before);
    expect(d).toEqual(before);
  });

  it("re-publishing the same result is not a conflict", () => {
    let d = upToR3();
    d = setHeatStatus(d, "R3-H1", "running");
    const res = applyHeatResult(d, "R1-H1", resultBy(heat(d, "R1-H1"), (s) => 100 - s));
    expect(res.conflict).toBeUndefined();
    expect(res.draw).toEqual(d);
  });

  it("a correction whose downstream has not started recomputes the pools", () => {
    let d = draw18();
    d = publishRound(d, "R1");
    expect(seeds(d, "R2")[0]).toEqual([7, 14, 15]);
    const res = applyHeatResult(d, "R1-H1", swapWinner(d, "R1-H1"));
    expect(res.conflict).toBeUndefined();
    // Seed 12 now wins R1-H1 (→ R3) and seed 1 drops into the second-chance round with the best 2nd-place total.
    expect(round(res.draw, "R3").arrivals.map((a) => a.originalSeed)).toContain(12);
    expect(round(res.draw, "R2").arrivals.map((a) => a.originalSeed)).toContain(1);
    expect(seeds(res.draw, "R2").flat()).toContain(1);
    expect(seeds(res.draw, "R2").flat()).not.toContain(12);
  });

  it("a correction is refused when the affected round has published heats", () => {
    const d = upToR3();
    const res = applyHeatResult(d, "R1-H1", swapWinner(d, "R1-H1"));
    expect(res.conflict!.affectedHeats.every((h) => h.status === "published" || h.status === "running")).toBe(true);
    expect(res.draw).toEqual(d);
  });

  it("un-publishing follows the same rule", () => {
    let d = upToR3();
    d = setHeatStatus(d, "R3-H1", "running");
    expect(unpublishHeat(d, "R1-H1").conflict).toBeDefined();
    const early = publish(draw18(), "R1-H1");
    const res = unpublishHeat(early, "R1-H1");
    expect(res.conflict).toBeUndefined();
    expect(heat(res.draw, "R1-H1").status).toBe("pending");
    expect(res.draw.results["R1-H1"]).toBeUndefined();
    expect(round(res.draw, "R3").arrivals).toEqual([]);
  });
});

describe("2F manual override", () => {
  it("moving a rider into another slot before the start sets manualOverride and swaps the riders", () => {
    const d = manualMove(draw18(), { from: { heatId: "R1-H1", slot: 1 }, to: { heatId: "R1-H2", slot: 2 } });
    expect(heat(d, "R1-H1").slots.map((s) => s.seed)).toEqual([1, 14, 13]);
    expect(heat(d, "R1-H2").slots.map((s) => s.seed)).toEqual([2, 11, 12]);
    expect(heat(d, "R1-H1").manualOverride).toBe(true);
    expect(heat(d, "R1-H2").manualOverride).toBe(true);
    expect(heat(d, "R1-H3").manualOverride).toBe(false);
  });

  it("auto-seeding leaves a hand-arranged heat alone", () => {
    let d = draw18();
    for (const id of ["R1-H1", "R1-H2", "R1-H3", "R1-H4", "R1-H5", "R1-H6"]) d = publish(d, id);
    d = manualMove(d, { from: { heatId: "R2-H1", slot: 0 }, to: { heatId: "R2-H4", slot: 1 } });
    const arranged = structuredClone(heat(d, "R2-H1").slots);
    // A harmless re-publish of R1-H6 makes the engine re-deal R2 — the arranged heats stay as they are.
    const res = applyHeatResult(d, "R1-H6", resultBy(heat(d, "R1-H6"), (s) => 100 - s));
    expect(res.conflict).toBeUndefined();
    expect(heat(res.draw, "R2-H1").slots).toEqual(arranged);
    expect(heat(res.draw, "R2-H1").manualOverride).toBe(true);
  });

  it("refuses to move riders in or out of a heat that has started", () => {
    const d = setHeatStatus(draw18(), "R1-H1", "running");
    expect(() => manualMove(d, { from: { heatId: "R1-H1", slot: 0 }, to: { heatId: "R1-H2", slot: 0 } })).toThrow(/started/);
  });

  it("refuses to move placeholders", () => {
    expect(() => manualMove(draw18(), { from: { heatId: "R2-H1", slot: 0 }, to: { heatId: "R2-H2", slot: 0 } })).toThrow(/not been seeded/);
  });
});

describe("2F rider identification warnings (doc 08 §5)", () => {
  const withRed = (s: number) => (s === 1 || s === 12 ? { identifiers: { vest_colour: "red" } } : {});

  it("vests-per-heat: slot 2 of any heat is yellow, from the template palette", () => {
    const d = expandFormat(kota(), makeEntrants(18), { identification: "vests-per-heat" });
    expect(heat(d, "R1-H3").slots[1].vestColour).toBe("yellow");
    expect(d.rounds[0].heats.flatMap((h) => h.slots).map((s) => s.vestColour)).not.toContain(undefined);
  });

  it("vests-per-heat never warns about lycra colours (vests are handed out per heat)", () => {
    const d = expandFormat(kota(), makeEntrants(18, withRed), { identification: "vests-per-heat" });
    expect(d.warnings.filter((w) => w.type === "duplicate_identifier")).toEqual([]);
  });

  it("fixed-lycra-per-rider: two riders with the same lycra in one heat → a warning naming the heat; the draw still generates", () => {
    const d = expandFormat(kota(), makeEntrants(18, withRed), { identification: "fixed-lycra-per-rider" });
    const w = d.warnings.filter((x) => x.type === "duplicate_identifier");
    expect(w).toHaveLength(1);
    expect(w[0].heatId).toBe("R1-H1");
    expect(w[0].message).toContain("Heat 1");
    expect(w[0].message).toContain("red");
    expect(round(d, "R1").heats).toHaveLength(6);
    expect(heat(d, "R1-H1").slots.every((s) => s.vestColour === undefined)).toBe(true);
  });

  it("fixed lycra: different heats with the same colour are fine", () => {
    const d = expandFormat(kota(), makeEntrants(18, (s) => (s === 1 || s === 2 ? { identifiers: { vest_colour: "red" } } : {})), {
      identification: "fixed-lycra-per-rider",
    });
    expect(d.warnings.filter((x) => x.type === "duplicate_identifier")).toEqual([]);
  });

  it("kites-no-vests: identical brand + size + colours in one heat → a warning; different colours → none", () => {
    const kite = (colours: string) => ({ brand: "North", model: "Orbit", size: 9, colours });
    const same = expandFormat(kota(), makeEntrants(18, (s) => (s === 1 || s === 12 ? { identifiers: { kite: kite("blue/white") } } : {})), {
      identification: "kites-no-vests",
    });
    const w = same.warnings.filter((x) => x.type === "duplicate_identifier");
    expect(w).toHaveLength(1);
    expect(w[0].message).toContain("Heat 1");
    expect(w[0].message).toContain("North Orbit 9 · blue/white");
    const different = expandFormat(
      kota(),
      makeEntrants(18, (s) => (s === 1 ? { identifiers: { kite: kite("blue/white") } } : s === 12 ? { identifiers: { kite: kite("red") } } : {})),
      { identification: "kites-no-vests" },
    );
    expect(different.warnings.filter((x) => x.type === "duplicate_identifier")).toEqual([]);
  });

  it("bib-numbers: a duplicated bib in a heat warns", () => {
    const d = expandFormat(kota(), makeEntrants(18, (s) => ({ identifiers: { bib: s === 12 ? 1 : s } })), { identification: "bib-numbers" });
    expect(d.warnings.filter((x) => x.type === "duplicate_identifier").map((x) => x.heatId)).toEqual(["R1-H1"]);
  });

  it("warnings appear again when a later round is seeded with riders whose identifiers clash", () => {
    // Seeds 3 and 6 never share a heat until Round 3 (R3-H3); both wear green.
    const make = (s: number) => (s === 3 || s === 6 ? { identifiers: { vest_colour: "green" } } : {});
    let d = expandFormat(kota(), makeEntrants(18, make), { identification: "fixed-lycra-per-rider" });
    expect(d.warnings.filter((x) => x.type === "duplicate_identifier")).toEqual([]);
    for (const r of ["R1", "R2", "R3"]) d = publishRound(d, r);
    const w = d.warnings.filter((x) => x.type === "duplicate_identifier");
    expect(w.map((x) => x.heatId)).toEqual(["R3-H3"]);
  });
});
