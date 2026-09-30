import { describe, expect, it } from "vitest";
import { eventLabel, formatEventDates, groupOrgEvents } from "./event-label";

describe("event dates in words", () => {
  it("one day, several days in a month, across months, across years", () => {
    expect(formatEventDates("2026-10-10", "2026-10-10")).toBe("10 Oct 2026");
    expect(formatEventDates("2026-10-10", null)).toBe("10 Oct 2026");
    expect(formatEventDates("2026-10-10", "2026-10-12")).toBe("10–12 Oct 2026");
    expect(formatEventDates("2026-10-30", "2026-11-02")).toBe("30 Oct – 2 Nov 2026");
    expect(formatEventDates("2026-12-30", "2027-01-02")).toBe("30 Dec 2026 – 2 Jan 2027");
    expect(formatEventDates("2026-09-05", "2026-09-06")).toBe("5–6 Sep 2026");
  });
  it("no start date means no date text; a bad date is ignored", () => {
    expect(formatEventDates(null, "2026-10-12")).toBe("");
    expect(formatEventDates("not a date", null)).toBe("");
  });
});

describe("the label on the home page: Organisation · Location · Date", () => {
  it("joins the three parts in that order", () => {
    expect(eventLabel({ organisation: "Arrow", location: "El Gouna", startDate: "2026-10-10", endDate: "2026-10-12" })).toBe("Arrow · El Gouna · 10–12 Oct 2026");
  });
  it("leaves out what is missing without leaving stray separators", () => {
    expect(eventLabel({ organisation: "Arrow", location: null, startDate: "2026-10-10", endDate: null })).toBe("Arrow · 10 Oct 2026");
    expect(eventLabel({ organisation: "Arrow", location: "  ", startDate: null, endDate: null })).toBe("Arrow");
    expect(eventLabel({ organisation: null, location: "El Gouna", startDate: null, endDate: null })).toBe("El Gouna");
  });
});

describe("organisation page: upcoming, live and past", () => {
  const today = "2026-10-11";
  const ev = (id: string, status: string, start: string | null, end: string | null) => ({ id, status, start_date: start, end_date: end });
  const g = groupOrgEvents(
    [
      ev("past-complete", "complete", "2026-09-01", "2026-09-02"),
      ev("live", "live", "2026-10-10", "2026-10-12"),
      ev("later", "published", "2026-11-20", "2026-11-21"),
      ev("soon", "published", "2026-10-12", "2026-10-13"),
      ev("ended-not-marked", "published", "2026-10-01", "2026-10-02"),
      ev("undated", "published", null, null),
      ev("today-only", "published", "2026-10-11", "2026-10-11"),
      ev("older", "complete", "2026-03-01", "2026-03-02"),
    ],
    today,
  );
  it("live events are the ones the head judge has set live", () => expect(g.live.map((e) => e.id)).toEqual(["live"]));
  it("upcoming: soonest first; today's event and undated events are still upcoming", () =>
    expect(g.upcoming.map((e) => e.id)).toEqual(["today-only", "soon", "later", "undated"]));
  it("past: newest first, including published events whose last day has gone", () => expect(g.past.map((e) => e.id)).toEqual(["ended-not-marked", "past-complete", "older"]));
});
