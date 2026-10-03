// A1a-1 (docs/AUDIT.md): "no value" against "no value" is equal, never decided. A rider with no counted trick has no value for the
// trick tie-breakers; two such riders on the same total are a genuine tie that only the head judge can settle.
import { describe, expect, it } from "vitest";
import { computeHeat } from "./index";
import { hetx, impressions, J3, landed, preset } from "./fixtures";
import type { Attempt, RiderInput } from "./types";
import type { TieBreaker } from "@/lib/schemas/scoring-model";
import { tieSentences } from "@/lib/live/tie-words";

const crash = (seq: number): Attempt => ({ seq, status: "crashed", marks: [] });
const crashedEverything = (riderId: string, attempts: number, impression: number): RiderInput => ({
  riderId,
  attempts: Array.from({ length: attempts }, (_, i) => crash(i + 1)),
  impressionMarks: impressions([impression, impression, impression]),
});
const withBreakers = (breakers: TieBreaker[]) => preset("kota-best3-impression", (m) => void (m.tieBreakers = breakers));
const run = (riders: RiderInput[], model = preset("kota-best3-impression"), decisions: Array<{ riderIds: string[]; reason: string }> = []) =>
  computeHeat(model, { panelJudgeIds: J3, riders, headJudgeDecisions: decisions });

describe("A1a-1 · a final of 2 where both riders crash everything", () => {
  const final = [crashedEverything("blue", 2, 5.3), crashedEverything("yellow", 1, 5.3)];

  it("is a tie: same place, flagged, no tie-breaker named", () => {
    const res = run(final);
    expect(res.ranking.map((r) => [r.riderId, r.place, r.tieUnresolved, r.tieResolvedBy])).toEqual([["blue", 1, true, undefined], ["yellow", 1, true, undefined]]);
  });

  it("blocks Publish for a head judge decision, like any other unresolved tie", () => {
    expect(run(final).publishBlockers).toContainEqual({ type: "tie_unresolved", riders: ["blue", "yellow"] });
  });

  it("the order the riders were listed in does not pick the winner", () => {
    const flipped = run([...final].reverse());
    expect(flipped.ranking.map((r) => [r.place, r.tieUnresolved])).toEqual([[1, true], [1, true]]);
    expect(flipped.publishBlockers).toContainEqual({ type: "tie_unresolved", riders: ["yellow", "blue"] });
  });

  it("the explanation says the tie is open and names both riders", () => {
    const m = preset("kota-best3-impression");
    const s = tieSentences(m, run(final), (id) => id.toUpperCase());
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ unresolved: true, riderIds: ["blue", "yellow"] });
    expect(s[0].text).toMatch(/BLUE/);
    expect(s[0].text).toMatch(/YELLOW/);
    expect(s[0].text).not.toMatch(/ahead of/i);
  });

  it("two riders on 0.00 with nothing landed and no Impression are tied too", () => {
    const res = run([{ riderId: "a", attempts: [crash(1)] }, { riderId: "b", attempts: [] }]);
    expect(res.ranking.map((r) => [r.place, r.total])).toEqual([[1, 0], [1, 0]]);
    expect(res.publishBlockers.some((b) => b.type === "tie_unresolved")).toBe(true);
  });

  it("the head judge's decision settles it, and Publish is open again", () => {
    const decided = run(final, preset("kota-best3-impression"), [{ riderIds: ["yellow", "blue"], reason: "cleaner crash recovery" }]);
    expect(decided.ranking.map((r) => [r.riderId, r.place, r.tieResolvedBy])).toEqual([["yellow", 1, "head_judge"], ["blue", 2, "head_judge"]]);
    expect(decided.publishBlockers).toEqual([]);
  });

  it("a rider who landed something still beats one who crashed everything on the same total", () => {
    // 4.0 trick + 1.3 Impression = 5.3 against 0 + 5.3: the landed trick is a real difference, so no tie.
    const res = run([crashedEverything("blue", 2, 5.3), { riderId: "red", attempts: [landed(1, J3.map(() => hetx(4, 4, 4, 4)))], impressionMarks: impressions([1.3, 1.3, 1.3]) }]);
    expect(res.ranking.map((r) => [r.riderId, r.tieResolvedBy])).toEqual([["red", "highest_counted_trick"], ["blue", "highest_counted_trick"]]);
    expect(res.publishBlockers).toEqual([]);
  });
});

describe("A1a-1 · every tie-breaker treats no value against no value as equal", () => {
  const nothing = [crashedEverything("blue", 2, 5.3), crashedEverything("yellow", 1, 5.3)];
  const all: TieBreaker[] = ["highest_counted_trick", "next_counted_trick", "impression", "most_landed", "highest_any_trick"];

  for (const tb of all) {
    it(`${tb} alone leaves two riders with nothing landed tied`, () => {
      const res = run(nothing, withBreakers([tb, "head_judge"]));
      expect(res.ranking.map((r) => [r.place, r.tieUnresolved])).toEqual([[1, true], [1, true]]);
      expect(res.publishBlockers).toContainEqual({ type: "tie_unresolved", riders: ["blue", "yellow"] });
    });
  }

  it("no value still loses to a value (the other direction keeps working)", () => {
    const one: RiderInput = { riderId: "red", attempts: [landed(1, J3.map(() => hetx(2, 2, 2, 2)))], impressionMarks: impressions([3.3, 3.3, 3.3]) };
    const res = run([crashedEverything("blue", 1, 5.3), one], withBreakers(["highest_any_trick", "head_judge"]));
    expect(res.ranking.map((r) => [r.riderId, r.tieResolvedBy])).toEqual([["red", "highest_any_trick"], ["blue", "highest_any_trick"]]);
  });
});
