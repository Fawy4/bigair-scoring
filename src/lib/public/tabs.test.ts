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

  it("everything is on by default; Join follows its own switch and nothing else (Polish 3, item 12: it no longer hides while registration is closed)", () => {
    const on = visiblePublicTabs({ leaderboards: [], off: [] }).map((t) => t.key);
    expect(on).toContain("join");
    expect(on).toHaveLength(8);
    // a registrationOpen value, however old the caller, changes nothing
    expect(visiblePublicTabs({ leaderboards: [], off: [], registrationOpen: false } as never).map((t) => t.key)).toEqual(on);
    expect(visiblePublicTabs({ leaderboards: [], off: ["join"] }).map((t) => t.key)).not.toContain("join");
  });

  it("the organiser's switches hide a tab; an unknown key in the list changes nothing", () => {
    const keys = visiblePublicTabs({ leaderboards: [], off: ["rules", "join", "nonsense"] }).map((t) => t.key);
    expect(keys).toEqual(["home", "live", "results", "ladder", "riders", "placings"]);
  });

  it("at least one tab stays on, and Join counts as a tab like the others", () => {
    expect(tabsOffLeavesOne(["home", "live", "results", "ladder", "riders", "placings", "rules"], [])).toBe(true); // Join is left, and it stays shown
    expect(tabsOffLeavesOne(["home", "live", "results", "ladder", "riders", "placings", "rules", "join"], [])).toBe(false);
    expect(tabsOffLeavesOne(["home", "live", "results", "ladder", "riders", "placings"], [])).toBe(true);
    expect(tabsOffLeavesOne(["home", "live", "results", "ladder", "riders", "placings", "rules"], [{ title: "x" }])).toBe(true); // a leaderboard is still on
    expect(tabsOffLeavesOne([], [])).toBe(true);
  });

  it("an old link to a hidden tab lands on the first visible tab, never a 404; a visible tab stays where it is", () => {
    const settings = { leaderboards: [], off: ["home", "live"] };
    expect(isTabVisible("results", settings)).toBe(true);
    expect(isTabVisible("live", settings)).toBe(false);
    expect(isTabVisible("join", settings)).toBe(true);
    expect(firstVisibleHref("/e/arrow", settings)).toBe("/e/arrow/results");
    expect(firstVisibleHref("/e/arrow", { ...settings, off: [] })).toBe("/e/arrow");
  });

  it("the form refuses to switch every tab off", () => {
    const base = { name: "Arrow", slug: "arrow", start_date: "2026-10-02", end_date: "2026-10-04", timezone: "Africa/Cairo", settings: {}, branding: {} };
    expect(EventFormSchema.safeParse(base).success).toBe(true);
    expect(EventFormSchema.safeParse({ ...base, settings: { publicTabsOff: ["home", "live", "results", "ladder", "riders", "placings", "rules", "join"] } }).success).toBe(false); // Join counts too
    expect(EventFormSchema.safeParse({ ...base, settings: { publicTabsOff: ["home", "live", "results", "ladder", "riders", "placings", "rules"] } }).success).toBe(true); // only Join left
    expect(EventFormSchema.safeParse({ ...base, settings: { publicTabsOff: ["rules", "join"] } }).success).toBe(true);
  });

  it("the big screen's colour mode is Dark unless the organiser chose Day", () => {
    const base = { name: "Arrow", slug: "arrow", start_date: "2026-10-02", end_date: "2026-10-04", timezone: "Africa/Cairo", branding: {} };
    expect(EventFormSchema.parse({ ...base, settings: {} }).settings.screenColourMode).toBe("dark");
    expect(EventFormSchema.parse({ ...base, settings: { screenColourMode: "day" } }).settings.screenColourMode).toBe("day");
    expect(EventFormSchema.safeParse({ ...base, settings: { screenColourMode: "blue" } }).success).toBe(false);
  });
});
