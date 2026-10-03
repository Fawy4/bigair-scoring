import { describe, expect, it } from "vitest";
import { liveScoresState, nextLiveScoresValue } from "./live-scores";

describe("the heat's live-scores pill (Polish 2b, item 2)", () => {
  it("follows the division, then the event, then 'after publish' (hidden)", () => {
    expect(liveScoresState({ heat: null, division: "live", event: "after_publish" })).toEqual({ isPublic: true, followsDefault: true });
    expect(liveScoresState({ heat: null, division: null, event: "live" })).toEqual({ isPublic: true, followsDefault: true });
    expect(liveScoresState({ heat: null, division: null, event: "after_publish" })).toEqual({ isPublic: false, followsDefault: true });
    expect(liveScoresState({ heat: null, division: "off", event: "live" })).toEqual({ isPublic: false, followsDefault: true });
    expect(liveScoresState({ heat: null, division: null, event: undefined })).toEqual({ isPublic: false, followsDefault: true });
  });

  it("the heat's own switch wins and is not 'following'", () => {
    expect(liveScoresState({ heat: true, division: "off", event: "off" })).toEqual({ isPublic: true, followsDefault: false });
    expect(liveScoresState({ heat: false, division: "live", event: "live" })).toEqual({ isPublic: false, followsDefault: false });
  });

  it("one tap flips what the public sees; going back to the default value follows the default again", () => {
    // following a public default: tap → hidden for this heat only
    expect(nextLiveScoresValue({ heat: null, division: "live", event: "off" })).toBe(false);
    // hidden by an own switch against a public default: tap → public again = the default, so the heat follows it
    expect(nextLiveScoresValue({ heat: false, division: "live", event: "off" })).toBeNull();
    // following a hidden default: tap → public for this heat only
    expect(nextLiveScoresValue({ heat: null, division: null, event: "after_publish" })).toBe(true);
    // public by own switch against a hidden default: tap → hidden = the default
    expect(nextLiveScoresValue({ heat: true, division: null, event: "after_publish" })).toBeNull();
  });
});
