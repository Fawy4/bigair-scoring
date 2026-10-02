import { describe, expect, it } from "vitest";
import { runLine, shortHeat, shortRound, shortTitle } from "./run-line";

// One line per heat in the run order, never truncated: "R1 · H2 · planned 14:05 · started 14:11 · Ended", or "R1 · H3 · est. 14:35" before it starts.
const h = (number: number, extra: Partial<{ name: string | null; number_suffix: string | null; started_at: string | null }> = {}) => ({ name: null, number, number_suffix: null, started_at: null, ...extra });
const r1 = { name: "Round 1", short_name: "R1" };

describe("short names", () => {
  it("round: the short name, else the name", () => {
    expect(shortRound(r1)).toBe("R1");
    expect(shortRound({ name: "Semi-final", short_name: null })).toBe("Semi-final");
    expect(shortRound(undefined)).toBe("");
  });
  it("heat: H2, H3R for a re-run, H3R2 for a second one; a name the organiser chose is kept", () => {
    expect(shortHeat(h(2))).toBe("H2");
    expect(shortHeat(h(3, { number_suffix: "R", name: "Heat 3 re-run" }))).toBe("H3R");
    expect(shortHeat(h(3, { number_suffix: "R2", name: "Heat 3 re-run 2" }))).toBe("H3R2");
    expect(shortHeat(h(1, { name: "Final" }))).toBe("Final");
    expect(shortHeat(h(4, { name: "Heat 4" }))).toBe("H4");
  });
  it("a title for a sentence: 'R1 · H3', with the division only when it is not the one on screen", () => {
    expect(shortTitle({ division: "Pro Men", round: r1, heat: h(3) })).toBe("R1 · H3");
    expect(shortTitle({ division: "Pro Women", round: r1, heat: h(3), withDivision: true })).toBe("Pro Women · R1 · H3");
  });
});

describe("one line of the run order", () => {
  const base = { round: r1, startedHhmm: null, estimatedHhmm: null, held: false, statusWord: null };
  it("a heat that has started carries both times: planned in the plan as written, started for real", () => {
    expect(runLine({ ...base, heat: h(2, { started_at: "2026-10-03T11:11:00Z" }), startedHhmm: "14:11", plannedHhmm: "14:05", statusWord: "Ended" })).toBe("R1 · H2 · planned 14:05 · started 14:11 · Ended");
  });
  it("without a planned time (a heat outside the run order) it says when it started", () => {
    expect(runLine({ ...base, heat: h(2, { started_at: "2026-10-03T11:05:00Z" }), startedHhmm: "14:05", statusWord: "Ended" })).toBe("R1 · H2 · started 14:05 · Ended");
  });
  it("a heat that has not started shows only the estimate, even when the plan said another time", () => {
    expect(runLine({ ...base, heat: h(3), plannedHhmm: "14:20", estimatedHhmm: "14:35" })).toBe("R1 · H3 · est. 14:35");
  });
  it("a heat not started yet shows the run order's estimate, marked as one", () => {
    expect(runLine({ ...base, heat: h(3), estimatedHhmm: "14:20" })).toBe("R1 · H3 · est. 14:20");
  });
  it("on a wind hold there is no estimate: the word 'held'; with no time at all just round and heat", () => {
    expect(runLine({ ...base, heat: h(3), estimatedHhmm: "14:20", held: true })).toBe("R1 · H3 · held");
    expect(runLine({ ...base, heat: h(3) })).toBe("R1 · H3");
  });
  it("a re-run reads H3R and keeps its state word", () => {
    expect(runLine({ ...base, heat: h(3, { number_suffix: "R", name: "Heat 3 re-run" }), estimatedHhmm: "14:40", statusWord: "Cancelled" })).toBe("R1 · H3R · est. 14:40 · Cancelled");
  });
  it("stays short enough to wrap on two lines of the narrow column: a normal started line under 50 characters, the longest (second re-run, under review) under 66", () => {
    const normal = runLine({ ...base, heat: h(2, { started_at: "x" }), startedHhmm: "14:11", plannedHhmm: "14:05", statusWord: "Ended" });
    const longest = runLine({ ...base, heat: h(12, { number_suffix: "R2", name: "Heat 12 re-run 2", started_at: "x" }), startedHhmm: "14:11", plannedHhmm: "14:05", statusWord: "Under review" });
    expect(normal.length).toBeLessThan(50);
    expect(longest.length).toBeLessThan(66);
  });
});
