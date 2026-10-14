import { describe, expect, it } from "vitest";
import { NEW_DIVISION_LIVE_SETTINGS, parseDivisionLive } from "./division-live";

describe("what spectators see per attempt: the start value of a new division", () => {
  it("a new division starts on trick name + score", () => {
    expect(NEW_DIVISION_LIVE_SETTINGS.spectatorAttemptDisplay).toBe("trick_score");
    expect(parseDivisionLive({ ...NEW_DIVISION_LIVE_SETTINGS }).spectatorAttemptDisplay).toBe("trick_score");
  });

  it("every existing division keeps the choice it has", () => {
    expect(parseDivisionLive({}).spectatorAttemptDisplay).toBe("number_score");
    expect(parseDivisionLive(null).spectatorAttemptDisplay).toBe("number_score");
    expect(parseDivisionLive({ spectatorAttemptDisplay: "number_score" }).spectatorAttemptDisplay).toBe("number_score");
    expect(parseDivisionLive({ spectatorAttemptDisplay: "score_only" }).spectatorAttemptDisplay).toBe("score_only");
    expect(parseDivisionLive({ spectatorAttemptDisplay: "trick_score" }).spectatorAttemptDisplay).toBe("trick_score");
  });

  it("the start value leaves every other live setting at its own default", () => {
    const live = parseDivisionLive({ ...NEW_DIVISION_LIVE_SETTINGS });
    expect(live.showPercentOfMax).toBe(false);
    expect(live.publicLiveScores).toBeNull();
  });
});
