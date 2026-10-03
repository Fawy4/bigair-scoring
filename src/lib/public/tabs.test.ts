import { describe, expect, it } from "vitest";
import { EventFormSchema } from "@/lib/schemas/event-settings";
import { firstVisibleHref, isTabVisible, publicTabs, tabsOffLeavesOne, visiblePublicTabs } from "./tabs";

const lb = [{ title: "Highest Jump" }, { title: "Longest Ride" }];

describe("the public event page's tabs (Polish 2b, item 5)", () => {
  it("lists every tab the page has today, in the page's order, external leaderboards included", () => {
    expect(publicTabs(lb).map((t) => t.key)).toEqual(["home", "live", "results", "ladder", "riders", "placings", "rules", "leaderboard-1", "leaderboard-2", "join"]);
    expect(publicTabs([]).map((t) => t.key)).toEqual(["home", "live", "results", "ladder", "riders", "placings", "rules", "join"]);
    expect(publicTabs(lb).find((t) => t.key === "leaderboard-2")?.label).toBe("Longest Ride");
  });

  it("everything is on by default; Join is hidden on its own while registration is closed", () => {
    const open = visiblePublicTabs({ leaderboards: [], off: [], registrationOpen: true }).map((t) => t.key);
    expect(open).toContain("join");
    const closed = visiblePublicTabs({ leaderboards: [], off: [], registrationOpen: false }).map((t) => t.key);
    expect(closed).not.toContain("join");
    expect(closed).toHaveLength(open.length - 1);
  });

  it("the organiser's switches hide a tab; an unknown key in the list changes nothing", () => {
    const keys = visiblePublicTabs({ leaderboards: [], off: ["rules", "join", "nonsense"], registrationOpen: true }).map((t) => t.key);
    expect(keys).toEqual(["home", "live", "results", "ladder", "riders", "placings"]);
  });

  it("at least one tab stays on: Join does not count while it can be hidden by registration", () => {
    expect(tabsOffLeavesOne(["home", "live", "results", "ladder", "riders", "placings", "rules"], [])).toBe(false); // only Join would be left
    expect(tabsOffLeavesOne(["home", "live", "results", "ladder", "riders", "placings"], [])).toBe(true);
    expect(tabsOffLeavesOne(["home", "live", "results", "ladder", "riders", "placings", "rules"], [{ title: "x" }])).toBe(true); // a leaderboard is still on
    expect(tabsOffLeavesOne([], [])).toBe(true);
  });

  it("an old link to a hidden tab lands on the first visible tab, never a 404; a visible tab stays where it is", () => {
    const settings = { leaderboards: [], off: ["home", "live"], registrationOpen: false };
    expect(isTabVisible("results", settings)).toBe(true);
    expect(isTabVisible("live", settings)).toBe(false);
    expect(isTabVisible("join", settings)).toBe(false);
    expect(firstVisibleHref("/e/arrow", settings)).toBe("/e/arrow/results");
    expect(firstVisibleHref("/e/arrow", { ...settings, off: [] })).toBe("/e/arrow");
  });

  it("the form refuses to switch every tab off", () => {
    const base = { name: "Arrow", slug: "arrow", start_date: "2026-10-02", end_date: "2026-10-04", timezone: "Africa/Cairo", settings: {}, branding: {} };
    expect(EventFormSchema.safeParse(base).success).toBe(true);
    expect(EventFormSchema.safeParse({ ...base, settings: { publicTabsOff: ["home", "live", "results", "ladder", "riders", "placings", "rules"] } }).success).toBe(false);
    expect(EventFormSchema.safeParse({ ...base, settings: { publicTabsOff: ["rules", "join"] } }).success).toBe(true);
  });

  it("the big screen's colour mode is Dark unless the organiser chose Day", () => {
    const base = { name: "Arrow", slug: "arrow", start_date: "2026-10-02", end_date: "2026-10-04", timezone: "Africa/Cairo", branding: {} };
    expect(EventFormSchema.parse({ ...base, settings: {} }).settings.screenColourMode).toBe("dark");
    expect(EventFormSchema.parse({ ...base, settings: { screenColourMode: "day" } }).settings.screenColourMode).toBe("day");
    expect(EventFormSchema.safeParse({ ...base, settings: { screenColourMode: "blue" } }).success).toBe(false);
  });
});
