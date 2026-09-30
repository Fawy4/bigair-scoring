import { describe, expect, it } from "vitest";
import { FormatTemplateSchema, parseFormatTemplate } from "@/lib/schemas/format-template";
import { addRoundAfter, advanceCount, ladderProblems, placeTargets, relink, removeRound, roundsOf, setPlaceTarget, setRoundSizes } from "./custom-ladder";
import { newCustomFormat } from "./custom";
import { previewFormat } from "./preview";

const start = () => FormatTemplateSchema.parse(newCustomFormat()) as unknown as Parameters<typeof relink>[0];
const ids = (t: unknown) => roundsOf(t as never).map((r) => r.id);

describe("visual ladder builder", () => {
  it("the starting ladder is valid: heats of 4, top 2 to the final", () => {
    const t = start();
    expect(ids(t)).toEqual(["R1", "F"]);
    expect(placeTargets(roundsOf(t)[0]).places.slice(0, 3)).toEqual(["F", "F", "eliminated"]);
    expect(ladderProblems(t, 14)).toEqual([]);
  });

  it("'+ Add round' inserts a round after the chosen one and links it: the round before sends its 1st and 2nd to it", () => {
    const t = addRoundAfter(start(), "R1");
    expect(ids(t)).toEqual(["R1", "R2", "F"]);
    const [r1, r2, f] = roundsOf(t);
    expect(placeTargets(r1).places.slice(0, 2)).toEqual(["R2", "R2"]);
    expect(r2.entrantsFrom).toEqual([{ type: "round_places", round: "R1", places: [1, 2] }]);
    // R1's top places now go to R2, so the Final is fed by nobody until R2's places are sent on
    expect(f.entrantsFrom).toEqual([{ type: "seeds" }]);
    expect(ladderProblems(t, 14).join(" ")).toContain("gets no riders");
  });

  it("a dropdown per place: 1st → Semi-finals, 2nd → Second chance, the rest → out; entrantsFrom follows", () => {
    let t = addRoundAfter(addRoundAfter(start(), "R1"), "R2");
    expect(ids(t)).toEqual(["R1", "R2", "R3", "F"]);
    t = setPlaceTarget(t, "R1", 1, "R3");
    t = setPlaceTarget(t, "R1", 2, "R2");
    t = setPlaceTarget(t, "R2", 1, "R3");
    t = setPlaceTarget(t, "R3", 1, "F");
    t = setPlaceTarget(t, "R3", 2, "F");
    const [r1, r2, r3, f] = roundsOf(t);
    expect(placeTargets(r1).places.slice(0, 3)).toEqual(["R3", "R2", "eliminated"]);
    expect(r2.entrantsFrom).toEqual([{ type: "round_places", round: "R1", places: [2] }]);
    expect(r3.entrantsFrom).toEqual([{ type: "round_places", round: "R1", places: [1] }, { type: "round_places", round: "R2", places: [1] }]);
    expect(f.entrantsFrom).toEqual([{ type: "round_places", round: "R3", places: [1, 2] }]);
    expect(advanceCount(r1, ["R2", "R3", "F"])).toBe(2);
    expect(FormatTemplateSchema.safeParse(t).success).toBe(true);
    expect(previewFormat(parseFormatTemplate(t as never), 14).ok).toBe(true);
  });

  it("removing a round sends its places out and relinks", () => {
    const t = removeRound(addRoundAfter(start(), "R1"), "R2");
    expect(ids(t)).toEqual(["R1", "F"]);
    expect(placeTargets(roundsOf(t)[0]).places.slice(0, 2)).toEqual(["eliminated", "eliminated"]); // they went to R2
  });

  it("per-round target, minimum and maximum: defaults are not stored, differences are", () => {
    let t = setRoundSizes(start(), "R1", { target: 3 });
    expect(roundsOf(t)[0]).toMatchObject({ heatSize: 3, uneven: "minimum_riders" });
    expect(roundsOf(t)[0].minHeatSize).toBeUndefined();
    t = setRoundSizes(t, "R1", { min: 3, max: 3 });
    expect(roundsOf(t)[0]).toMatchObject({ minHeatSize: 3, maxHeatSize: 3 });
    t = setRoundSizes(t, "R1", { min: 2, max: 4 }); // back to the defaults for target 3
    expect(roundsOf(t)[0].minHeatSize).toBeUndefined();
    expect(roundsOf(t)[0].maxHeatSize).toBeUndefined();
    // 14 riders, 3 / 3 / 3 → cannot keep the numbers: the check names the round and the counts
    const strict = setRoundSizes(setRoundSizes(start(), "R1", { target: 3 }), "R1", { min: 3, max: 3 });
    expect(ladderProblems(strict, 14).join(" ")).toMatch(/Round 1 receives 14 riders in 4 heats of 3–4, but the limits are 3 to 3 per heat/);
  });

  it("a ladder that does not end in one heat is flagged with the round and the count", () => {
    let t = start();
    t = setPlaceTarget(t, "R1", 1, "eliminated");
    t = setPlaceTarget(t, "R1", 2, "eliminated");
    // R1 is the only round that rides from the seeds; make the last round a wide one
    const rounds = roundsOf(t).map((r) => (r.id === "F" ? { ...r, heatCountOverride: 2 } : r));
    expect(ladderProblems({ ...(t as object), rounds } as never, 14).join(" ")).toMatch(/The last round, Final, has 2 heats/);
  });

  it("relink keeps pooled rounds alone", () => {
    const t = relink(start());
    expect(ids(t)).toEqual(["R1", "F"]);
  });
});
