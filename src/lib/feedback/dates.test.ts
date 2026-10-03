import { describe, expect, it } from "vitest";
import { inDateRange, quickRange } from "./dates";

describe("feedback date filter (Polish 2b, item 4)", () => {
  const now = new Date("2026-10-03T14:00:00Z");
  it("quick picks: Today, Last 7 days, All", () => {
    expect(quickRange("today", now)).toEqual({ from: "2026-10-03", to: "2026-10-03" });
    expect(quickRange("last7", now)).toEqual({ from: "2026-09-27", to: "2026-10-03" });
    expect(quickRange("all", now)).toEqual({ from: "", to: "" });
  });
  it("from and to include their own day; empty or invalid ends do not limit", () => {
    expect(inDateRange("2026-10-03T23:59:00Z", "2026-10-03", "2026-10-03")).toBe(true);
    expect(inDateRange("2026-10-02T23:59:00Z", "2026-10-03", "")).toBe(false);
    expect(inDateRange("2026-10-04T00:00:00Z", "", "2026-10-03")).toBe(false);
    expect(inDateRange("2026-01-01T00:00:00Z", "", "")).toBe(true);
    expect(inDateRange("2026-01-01T00:00:00Z", "garbage", "also")).toBe(true);
  });
});
