import { describe, expect, it } from "vitest";
import { settingsFrom } from "./settings-from";

describe("'Settings from <event> at hh:mm' (Polish 3, item 9)", () => {
  it("names the real event and the time in the event's own time zone", () => {
    expect(settingsFrom({ eventName: "Arrow launch", at: "2026-10-10T07:05:00Z", timezone: "Africa/Cairo" })).toEqual({ eventName: "Arrow launch", time: "10:05" });
  });
  it("falls back to the time the copy was made when the settings were never refreshed", () => {
    expect(settingsFrom({ eventName: "Arrow launch", at: null, createdAt: "2026-10-10T08:30:00Z", timezone: "Africa/Cairo" })?.time).toBe("11:30");
  });
  it("is null for an event that is not a copy (the Demo): there is nothing to refresh from", () => {
    expect(settingsFrom({ eventName: null, at: "2026-10-10T07:05:00Z", timezone: "Africa/Cairo" })).toBeNull();
  });
});
