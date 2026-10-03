import { describe, expect, it } from "vitest";
import type { ChecklistItem } from "./publish-checklist";
import { reviewBarState, type BarJudge } from "./review-bar";

const judges = (submitted: boolean[], live = true): BarJudge[] => submitted.map((s, i) => ({ id: `s${i + 1}`, word: `Judge ${i + 1}`, live, submitted: s }));
const sheet = (n: number): ChecklistItem => ({ kind: "sheet", judge: `s${n}`, text: `Judge ${n}: sheet not submitted`, target: { kind: "sheet", seatId: `s${n}` } });
const imp = (n: number): ChecklistItem => ({ kind: "impression", judge: `s${n}`, text: `Judge ${n} has no Impression score`, target: { kind: "impression", seatId: `s${n}`, entryId: "e1" } });
const tie: ChecklistItem = { kind: "tie", text: "Tie for 1st", riders: ["a", "b"] };

describe("the review bar", () => {
  it("running: a quiet count of judges scoring", () => {
    const four = judges([false, false, false, false]).map((j, i) => ({ ...j, live: i < 3 }));
    expect(reviewBarState({ status: "running", judges: four, items: [] })).toEqual({ kind: "running", scoring: 3, total: 4 });
    expect(reviewBarState({ status: "paused", judges: judges([false, false], false), items: [] })).toEqual({ kind: "running", scoring: 0, total: 2 });
  });
  it("no bar before the heat starts or after it is published", () => {
    for (const status of ["scheduled", "published", "cancelled"]) expect(reviewBarState({ status, judges: judges([true]), items: [] })).toBeNull();
  });
  it("amber: only judges who have not submitted, by name", () => {
    expect(reviewBarState({ status: "ended", judges: judges([true, false, true, false]), items: [sheet(2), sheet(4)] })).toEqual({
      kind: "waiting",
      total: 4,
      waiting: [
        { seatId: "s2", word: "Judge 2" },
        { seatId: "s4", word: "Judge 4" },
      ],
    });
  });
  it("red: the Publish blocker's own line, first one shown, with how many more", () => {
    const r = reviewBarState({ status: "under_review", judges: judges([true, true, false, true]), items: [sheet(3), imp(3), tie] });
    expect(r).toMatchObject({ kind: "blocked", more: 1, total: 4 });
    expect(r?.kind === "blocked" && r.item.text).toBe("Judge 3 has no Impression score");
  });
  it("green: everything submitted and nothing blocks", () => {
    expect(reviewBarState({ status: "ended", judges: judges([true, true, true, true]), items: [] })).toEqual({ kind: "ready", total: 4 });
  });
});
