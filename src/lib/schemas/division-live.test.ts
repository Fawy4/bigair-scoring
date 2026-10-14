import { describe, expect, it } from "vitest";
import { DivisionLiveSchema, mergeLiveSettings, parseDivisionLive } from "./division-live";

describe("what spectators see per attempt changes only when the organiser changes it", () => {
  it("saving another setting leaves it exactly as stored, whatever the open page last saw", () => {
    // the page was opened when it was "trick name + score"; since then it was changed to "attempt number + score" (another tab, a script); the organiser ticks the percentage box
    const stored = { spectatorAttemptDisplay: "number_score", showPercentOfMax: false };
    expect(mergeLiveSettings(stored, { showPercentOfMax: true })).toEqual({ spectatorAttemptDisplay: "number_score", showPercentOfMax: true });
    for (const mode of ["number_score", "trick_score", "score_only"]) {
      expect(mergeLiveSettings({ spectatorAttemptDisplay: mode }, { publicLiveScores: "live" }).spectatorAttemptDisplay).toBe(mode);
      expect(mergeLiveSettings({ spectatorAttemptDisplay: mode }, { impressionSummary: { variety: false } }).spectatorAttemptDisplay).toBe(mode);
      expect(mergeLiveSettings({ spectatorAttemptDisplay: mode }, { holdFinalResult: true }).spectatorAttemptDisplay).toBe(mode);
    }
  });

  it("a setting that was never stored is not written down as its default (and never as a different one)", () => {
    expect("spectatorAttemptDisplay" in mergeLiveSettings({}, { showPercentOfMax: true })).toBe(false);
    expect("spectatorAttemptDisplay" in mergeLiveSettings(null, { showPercentOfMax: true })).toBe(false);
    expect("spectatorAttemptDisplay" in mergeLiveSettings(undefined, { publicResultsOnPublish: false })).toBe(false);
    expect(parseDivisionLive(mergeLiveSettings({}, { showPercentOfMax: true })).spectatorAttemptDisplay).toBe("number_score");
  });

  it("it changes when the organiser picks it, and only then", () => {
    expect(mergeLiveSettings({ spectatorAttemptDisplay: "number_score" }, { spectatorAttemptDisplay: "trick_score" }).spectatorAttemptDisplay).toBe("trick_score");
    expect(mergeLiveSettings({}, { spectatorAttemptDisplay: "score_only" }).spectatorAttemptDisplay).toBe("score_only");
  });

  it("a part of the summary card changes only that part; the other parts and unknown keys stay", () => {
    const stored = { spectatorAttemptDisplay: "trick_score", impressionSummary: { counts: true, variety: true, directions: false, landedList: true }, futureKey: { a: 1 } };
    const out = mergeLiveSettings(stored, { impressionSummary: { variety: false } });
    expect(out.impressionSummary).toEqual({ counts: true, variety: false, directions: false, landedList: true });
    expect(out.futureKey).toEqual({ a: 1 });
    expect(out.spectatorAttemptDisplay).toBe("trick_score");
    expect(mergeLiveSettings({}, { impressionSummary: { variety: false } }).impressionSummary).toEqual({ variety: false });
  });

  it("a key that is not a setting is ignored; the stored object is not changed in place", () => {
    const stored = { spectatorAttemptDisplay: "number_score" };
    expect(mergeLiveSettings(stored, { nonsense: 1 } as never)).toEqual({ spectatorAttemptDisplay: "number_score" });
    mergeLiveSettings(stored, { spectatorAttemptDisplay: "trick_score" });
    expect(stored.spectatorAttemptDisplay).toBe("number_score");
  });

  it("a stored value this version cannot read is kept for the organiser to see, not replaced by a default on the next save", () => {
    const stored = { spectatorAttemptDisplay: "scores_only", showPercentOfMax: false };
    expect(mergeLiveSettings(stored, { showPercentOfMax: true }).spectatorAttemptDisplay).toBe("scores_only");
  });

  it("the merged picture is still checked by the schema before it is stored", () => {
    expect(DivisionLiveSchema.safeParse(mergeLiveSettings({}, { spectatorAttemptDisplay: "words" as never })).success).toBe(false);
    expect(DivisionLiveSchema.safeParse(mergeLiveSettings({}, { spectatorAttemptDisplay: "trick_score" })).success).toBe(true);
  });

  it("the schema's own default is unchanged: a division that never stored the choice reads as attempt number + score", () => {
    expect(parseDivisionLive({}).spectatorAttemptDisplay).toBe("number_score");
    expect(parseDivisionLive(null).spectatorAttemptDisplay).toBe("number_score");
  });
});
