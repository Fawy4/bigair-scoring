import { describe, expect, it } from "vitest";
import { effectiveSetting, holdAtPublish, liveScoresOn } from "./visibility";

// docs/08 §1H-11
describe("1H-11 hold at publish", () => {
  it("hold the final and this is the last round → held", () => expect(holdAtPublish({ holdFinalResult: true, publicResultsOnPublish: true, roundIsLast: true })).toBe(true));
  it("hold the final but not the last round → not held", () => expect(holdAtPublish({ holdFinalResult: true, publicResultsOnPublish: true, roundIsLast: false })).toBe(false));
  it("do not hold the final, last round → not held", () => expect(holdAtPublish({ holdFinalResult: false, publicResultsOnPublish: true, roundIsLast: true })).toBe(false));
  it("results are not public on publish → always held", () => {
    for (const hold of [true, false]) for (const last of [true, false]) expect(holdAtPublish({ holdFinalResult: hold, publicResultsOnPublish: false, roundIsLast: last })).toBe(true);
  });
});

describe("1H-11 division setting wins over the event's", () => {
  it("null means use the event's value", () => expect(effectiveSetting(null, true)).toBe(true));
  it("the division's value wins", () => {
    expect(effectiveSetting(false, true)).toBe(false);
    expect(effectiveSetting(true, false)).toBe(true);
  });
});

describe("1H-11 live scores", () => {
  it("the heat's switch wins, then the division's, then the event's", () => {
    expect(liveScoresOn({ heat: true, division: "after_publish", event: "after_publish" })).toBe(true);
    expect(liveScoresOn({ heat: false, division: "live", event: "live" })).toBe(false);
    expect(liveScoresOn({ heat: null, division: "after_publish", event: "live" })).toBe(false);
    expect(liveScoresOn({ heat: null, division: null, event: "live" })).toBe(true);
    expect(liveScoresOn({ heat: null, division: null, event: "after_publish" })).toBe(false);
  });
});
