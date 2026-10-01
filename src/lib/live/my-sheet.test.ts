// "Which tricks count", seen by Judge 1 alone: docs/08 §1A, Red's heat (Judge 1: 7.625, 8.25, 7.25, crash, 8.125), best 3.
import { describe, expect, it } from "vitest";
import kotaJson from "../../../presets/scoring/kota-best3-impression.json";
import { parseScoringModel } from "@/lib/schemas/scoring-model";
import { myCountedSeqs, type SheetAttempt } from "./my-sheet";

const kota = parseScoringModel(structuredClone(kotaJson));
const c = (height: number, extremity: number, technicality: number, execution: number) => ({ height, extremity, technicality, execution });
const attempts: SheetAttempt[] = [
  { id: "a1", seq: 1, status: "landed", trickName: "Kiteloop board-off", categoryKey: "board_off", direction: "left" },
  { id: "a2", seq: 2, status: "landed", trickName: "Double loop", categoryKey: "kiteloop", direction: "right" },
  { id: "a3", seq: 3, status: "landed", trickName: "Late backroll kiteloop", categoryKey: "kiteloop", direction: "left" },
  { id: "a4", seq: 4, status: "crashed", trickName: "Board-off", categoryKey: "board_off", direction: "right" },
  { id: "a5", seq: 5, status: "landed", trickName: "Contra loop", categoryKey: "kiteloop", direction: "left" },
];
const mine = {
  a1: { score: null, missed: false, criteria: c(8.0, 7.5, 7.0, 8.0) },
  a2: { score: null, missed: false, criteria: c(9.0, 9.0, 8.0, 7.0) },
  a3: { score: null, missed: false, criteria: c(7.0, 7.0, 6.5, 8.5) },
  a5: { score: null, missed: false, criteria: c(8.5, 8.0, 7.5, 8.5) },
};

describe("myCountedSeqs", () => {
  it("the best three of Judge 1's own scores count: attempts 2, 5 and 1", () => {
    expect([...myCountedSeqs(kota, attempts, mine, "J1")].sort()).toEqual([1, 2, 5]);
  });
  it("an attempt Judge 1 has not scored yet, or marked Missed, does not count", () => {
    const part = { ...mine, a2: { score: null, missed: true, criteria: null } };
    expect([...myCountedSeqs(kota, attempts, { a1: part.a1, a2: part.a2, a3: part.a3 }, "J1")].sort()).toEqual([1, 3]);
  });
  it("nothing scored: nothing counts, and it never throws", () => {
    expect(myCountedSeqs(kota, attempts, {}, "J1").size).toBe(0);
    expect(myCountedSeqs(kota, attempts, { a1: { score: 99, missed: false, criteria: { height: 99 } as never } }, "J1").size).toBe(0);
  });
});
