// docs/08 §1G-9 and §1G-10.
import { describe, expect, it } from "vitest";
import { formatCell } from "@/lib/live/matrix-model";
import { heatSummary, type SummaryAttempt } from "./summary";
import { showPercent } from "@/lib/schemas/division-live";

const a = (seq: number, trick: string, status: "landed" | "crashed", direction: "left" | "right" | null = "left"): SummaryAttempt => ({ id: `a${seq}`, seq, status, trickName: trick, direction });

describe("heatSummary", () => {
  it("the legacy vector: 7 attempts, 5 landed, 2 crashed, cap 7", () => {
    const attempts = [a(1, "Backroll", "landed"), a(2, "Frontroll", "landed", "right"), a(3, "Kiteloop", "crashed"), a(4, "Double loop", "landed"), a(5, "Backroll", "landed", "right"), a(6, "Handle pass", "crashed", "right"), a(7, "Megaloop", "landed")];
    const s = heatSummary(attempts, {}, (n) => n.toFixed(1));
    expect(s).toMatchObject({ attempts: 7, landed: 5, crashed: 2, repeats: 1, left: 3, right: 2 });
    expect(`${s.attempts} / 7`).toBe("7 / 7");
  });
  it("KOTA 1A seen by Judge 1: 5 attempts, 4 landed, 1 crashed, left 3, right 1, repeats 0; list by my score", () => {
    const attempts = [a(1, "Kiteloop board-off", "landed"), a(2, "Double loop", "landed", "right"), a(3, "Late backroll kiteloop", "landed"), a(4, "Board-off", "crashed", "right"), a(5, "Contra loop", "landed")];
    const mine = { a1: 7.625, a2: 8.25, a3: 7.25, a5: 8.125 };
    const s = heatSummary(attempts, mine, formatCell);
    expect(s).toMatchObject({ attempts: 5, landed: 4, crashed: 1, left: 3, right: 1, repeats: 0 });
    expect(s.landedList.map((t) => [t.seq, t.scoreLabel])).toEqual([[2, "8.25"], [5, "8.125"], [1, "7.625"], [3, "7.25"]]);
  });
  it("ties go by attempt number; Missed and unscored come last with a dash", () => {
    const attempts = [a(1, "A", "landed"), a(2, "B", "landed"), a(3, "C", "landed"), a(4, "D", "landed")];
    const s = heatSummary(attempts, { a1: 7, a2: 7, a3: "missed" }, (n) => n.toFixed(1));
    expect(s.landedList.map((t) => [t.seq, t.scoreLabel])).toEqual([[1, "7.0"], [2, "7.0"], [3, "—"], [4, "—"]]);
  });
  it("repeats are landed attempts whose normalised name was already landed", () => {
    const s = heatSummary([a(1, "Left  Backroll", "landed"), a(2, "left backroll", "landed"), a(3, "Left Backroll", "crashed"), a(4, "LEFT BACKROLL", "landed")], {}, String);
    expect(s.repeats).toBe(2);
  });
});

describe("percentages on screens (docs/08 §1G-10)", () => {
  it("only an explicit showPercentOfMax = true shows one; the scoring model's display never decides", () => {
    expect(showPercent({})).toBe(false);
    expect(showPercent(null)).toBe(false);
    expect(showPercent({ showPercentOfMax: true })).toBe(true);
    expect(showPercent({ showPercentOfMax: "yes" })).toBe(false);
  });
  it("31.54 of 40 reads 78.85 %", () => expect(((31.54 / 40) * 100).toFixed(2)).toBe("78.85"));
});
