// Phase 4b follow-up — the custom ladder builder follows the "Preview with N riders" number while the organiser designs, and
// "Apply to draw" uses the division's real confirmed riders and says what differs.
import { describe, expect, it } from "vitest";
import { copy } from "@/lib/ui-copy";
import { addHeat, addRound, newLadder, type CustomLadder } from "./custom-ladder";
import { checkLadder, type RiderRef } from "./custom-ladder-check";
import { ladderTemplate, ladderToDraw } from "./custom-ladder-draw";
import { designDifference, previewRiders } from "./custom-ladder-preview";
import { loadFormat, makeEntrants } from "./fixtures";

const real = (n: number): RiderRef[] => makeEntrants(n).map((e) => ({ id: e.id, name: e.name }));

/** Round 1 with `heats` heats of 3 seats, nothing placed. */
function heatsOfThree(heats: number): CustomLadder {
  let l = addRound(newLadder(3, 3, 3));
  for (let i = 0; i < heats; i++) l = addHeat(l, "R1", 3);
  return l;
}

describe("riders the builder designs for", () => {
  it("is exactly the preview number: placeholders while nobody is confirmed", () => {
    const list = previewRiders([], 14);
    expect(list).toHaveLength(14);
    expect(list[0].name).toBe("Rider 1");
    expect(new Set(list.map((r) => r.id)).size).toBe(14);
  });

  it("keeps the real riders first, then adds placeholders up to the preview number", () => {
    const list = previewRiders(real(22), 24);
    expect(list).toHaveLength(24);
    expect(list.slice(0, 22).map((r) => r.id)).toEqual(real(22).map((r) => r.id));
    expect(list[22].name).toBe("Rider 23");
    expect(list[23].name).toBe("Rider 24");
    expect(real(22).some((r) => r.id === list[22].id)).toBe(false);
  });

  it("uses only the first riders when the preview is smaller than the division", () => {
    const list = previewRiders(real(22), 20);
    expect(list.map((r) => r.id)).toEqual(real(20).map((r) => r.id));
  });

  it("never returns fewer than one rider", () => {
    expect(previewRiders([], 0)).toHaveLength(1);
  });
});

describe("the checker uses the preview number", () => {
  it("24 riders, 21 seats — 3 riders have no heat", () => {
    const check = checkLadder(heatsOfThree(7), previewRiders(real(22), 24));
    expect(check.faults.map((f) => f.message)).toContain("24 riders, 21 seats — 3 riders have no heat.");
  });

  it("the recommendations follow it too (24 riders → 8 heats of 3)", () => {
    const check = checkLadder(heatsOfThree(7), previewRiders([], 24));
    expect(check.recommendations.map((r) => r.message).join(" ")).toContain("24 riders → 8 heats of 3");
    const other = checkLadder(heatsOfThree(2), previewRiders([], 14));
    expect(other.recommendations.map((r) => r.message).join(" ")).toContain("14 riders →");
    expect(other.recommendations.map((r) => r.message).join(" ")).not.toContain("24 riders →");
  });

  it("a ladder with 8 heats of 3 is complete for 24 and not for 22", () => {
    expect(checkLadder(heatsOfThree(8), previewRiders([], 24)).faults.filter((f) => f.message.includes("riders,"))).toHaveLength(0);
    expect(checkLadder(heatsOfThree(8), previewRiders([], 22)).faults.map((f) => f.message).join(" ")).toContain("22 riders, 24 seats — 2 seats have no rider.");
  });
});

describe("Apply to draw: designed for N, the division has M", () => {
  it("says nothing when they match", () => {
    expect(designDifference(24, 24)).toBeNull();
  });

  it("2 seats will be empty when the division has fewer riders", () => {
    const d = designDifference(24, 22)!;
    expect(d).toEqual({ designed: 24, real: 22, emptySeats: 2, ridersWithoutSeat: 0 });
    expect(copy.builder.difference(d)).toBe("Designed for 24, the division has 22 — 2 seats will be empty.");
  });

  it("riders without a seat when the division has more riders", () => {
    const d = designDifference(22, 24)!;
    expect(d.ridersWithoutSeat).toBe(2);
    expect(copy.builder.difference(d)).toBe("Designed for 22, the division has 24 — 2 riders will have no seat.");
  });

  it("uses the singular for one", () => {
    expect(copy.builder.difference(designDifference(24, 23)!)).toBe("Designed for 24, the division has 23 — 1 seat will be empty.");
    expect(copy.builder.difference(designDifference(23, 24)!)).toBe("Designed for 23, the division has 24 — 1 rider will have no seat.");
  });

  it("the draw really has the empty seats (and does not fail) when the real division is smaller", () => {
    let l = heatsOfThree(8);
    l = { ...l, rounds: l.rounds.map((r) => ({ ...r, heats: r.heats.map((h, hi) => ({ ...h, seats: h.seats.map((_, si) => ({ type: "seed" as const, seed: hi * 3 + si + 1 })) })) })) };
    const base = loadFormat("heats4-top2-single-elim");
    const template = ladderTemplate(l, { name: "t", timing: base.timing });
    const draw = ladderToDraw(template, makeEntrants(22));
    const first = draw.rounds[0];
    expect(first.heats.reduce((n, h) => n + h.slots.length, 0)).toBe(24);
    expect(first.heats.flatMap((h) => h.slots).filter((s) => !s.entrantId)).toHaveLength(2);
  });
});
