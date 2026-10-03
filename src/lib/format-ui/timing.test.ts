import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFormatTemplate } from "@/lib/schemas/format-template";
import { previewFormat } from "./preview";
import { timingRows, withTimingCell, withTimingDefault, timingDefaults } from "./timing";

// Polish 2, item 10: one "Timing per round" table — warm-up, heat length, break after each heat — that writes the rounds; "Every round" writes the division's numbers.
const json = (f: string) => JSON.parse(readFileSync(`presets/formats/${f}.json`, "utf8"));
const knockout = () => json("heats4-top2-single-elim") as Record<string, unknown>;

describe("Timing per round", () => {
  it("knockout with 14 riders: R1, SF and F, each pre-filled with the division's 10 min heats, no warm-up, 3 min breaks", () => {
    const rows = timingRows(knockout(), 14);
    expect(rows.map((r) => [r.id, r.length.value, r.warmUp.value, r.breakAfter.value, r.length.own, r.warmUp.own, r.breakAfter.own])).toEqual([
      ["R1", 10, 0, timingDefaults(knockout()).breakAfterHeat, false, false, false],
      ["SF", 10, 0, timingDefaults(knockout()).breakAfterHeat, false, false, false],
      ["F", 10, 0, timingDefaults(knockout()).breakAfterHeat, false, false, false],
    ]);
  });
  it("a round's own numbers are stored only when they differ; the preview's time follows them", () => {
    let w = withTimingCell(knockout(), "F", "length", 15);
    w = withTimingCell(w, "R1", "breakAfter", 7);
    w = withTimingCell(w, "SF", "warmUp", 5);
    expect(w.roundDurationMin).toEqual({ F: 15 });
    expect(w.roundBreakAfterHeatMin).toEqual({ R1: 7 });
    expect(w.roundWarmUpMin).toEqual({ SF: 5 });
    const rows = timingRows(w, 14);
    expect(rows.find((r) => r.id === "F")!.length).toEqual({ value: 15, own: true });
    // typing the division's number again clears it
    expect(withTimingCell(w, "F", "length", 10).roundDurationMin).toBeUndefined();
    const before = previewFormat(parseFormatTemplate(knockout()), 14).totalMinutes;
    const after = previewFormat(parseFormatTemplate(w), 14).totalMinutes;
    expect(after).toBeGreaterThan(before);
  });
  it("Every round: changing the division's heat length moves every round that has no number of its own", () => {
    const w = withTimingDefault(withTimingCell(knockout(), "F", "length", 15), "length", 12);
    expect(timingRows(w, 14).map((r) => r.length.value)).toEqual([12, 12, 15]);
    expect((w.timing as { defaultHeatMin: number }).defaultHeatMin).toBe(12);
  });
  it("a fixed format (Megaloop): the table writes the rounds themselves", () => {
    const fixed = json("megaloop-women-6") as Record<string, unknown>;
    const rows = timingRows(fixed, 6);
    expect(rows.length).toBeGreaterThan(0);
    const first = rows[0].id;
    const w = withTimingCell(fixed, first, "length", 17);
    const round = (w.rounds as Array<{ id: string; durationMin?: number }>).find((r) => r.id === first)!;
    expect(round.durationMin).toBe(17);
    expect(w.roundDurationMin).toBeUndefined();
    expect(parseFormatTemplate(w)).toBeTruthy();
  });
});
