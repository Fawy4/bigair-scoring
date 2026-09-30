import { describe, expect, it } from "vitest";
import { formatFeedbackMarkdown, noteLine, pageLabelFor, type FeedbackNote } from "./format";

const note = (over: Partial<FeedbackNote> = {}): FeedbackNote => ({
  id: "1",
  tag: "layout",
  status: "open",
  pageLabel: "Riders step",
  eventName: "Arrow",
  organisationName: "Arrow",
  divisionName: "Pro Men",
  heatLabel: null,
  role: "owner",
  body: "Seed column too narrow on the phone",
  screenshotUrl: null,
  createdAt: "2026-09-30T10:00:00Z",
  ...over,
});

describe("noteLine", () => {
  it("writes one ready line per note in the agreed shape", () => {
    expect(noteLine(note({ screenshotUrl: "https://files.test/s.png" }))).toBe(
      '- [Riders step · Arrow · Pro Men · owner] "Seed column too narrow on the phone" (screenshot: https://files.test/s.png)',
    );
  });
  it("leaves out what is not there: no screenshot, no division, no event", () => {
    expect(noteLine(note())).toBe('- [Riders step · Arrow · Pro Men · owner] "Seed column too narrow on the phone"');
    expect(noteLine(note({ divisionName: null }))).toBe('- [Riders step · Arrow · owner] "Seed column too narrow on the phone"');
    expect(noteLine(note({ eventName: null, organisationName: "Demo", divisionName: null }))).toBe('- [Riders step · Demo · owner] "Seed column too narrow on the phone"');
    expect(noteLine(note({ eventName: null, organisationName: null, divisionName: null, pageLabel: "Admin · Health" }))).toBe('- [Admin · Health · owner] "Seed column too narrow on the phone"');
  });
  it("adds the heat when there is one", () => {
    expect(noteLine(note({ heatLabel: "Heat 3" }))).toContain("Pro Men · Heat 3 · owner]");
  });
  it("keeps a long note on one line and does not break the quotes", () => {
    const line = noteLine(note({ body: 'He said "too small"\n\nand   more ' }));
    expect(line).not.toContain("\n");
    expect(line).toContain('"He said “too small” and more"');
  });
});

describe("formatFeedbackMarkdown", () => {
  it("groups by tag in a fixed order, then by page, oldest first", () => {
    const md = formatFeedbackMarkdown(
      [
        note({ id: "1", tag: "idea", body: "idea one" }),
        note({ id: "2", tag: "bug", pageLabel: "Officials step", body: "bug officials", createdAt: "2026-09-30T09:00:00Z" }),
        note({ id: "3", tag: "bug", pageLabel: "Riders step", body: "bug riders b", createdAt: "2026-09-30T11:00:00Z" }),
        note({ id: "4", tag: "bug", pageLabel: "Riders step", body: "bug riders a", createdAt: "2026-09-30T08:00:00Z" }),
        note({ id: "5", tag: "new_rule", body: "rule" }),
      ],
      new Date("2026-10-01T12:00:00Z"),
    );
    const order = ["## Bug", "### Officials step", "bug officials", "### Riders step", "bug riders a", "bug riders b", "## New rule", "## Idea"].map((s) => md.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it("only open notes are exported, and the header says how many and when", () => {
    const md = formatFeedbackMarkdown([note({ id: "1" }), note({ id: "2", status: "done", body: "already done" })], new Date("2026-10-01T12:00:00Z"));
    expect(md).not.toContain("already done");
    expect(md).toContain("1 open note");
    expect(md).toContain("2026-10-01");
  });
  it("an empty list still makes a readable file", () => {
    expect(formatFeedbackMarkdown([], new Date("2026-10-01T12:00:00Z"))).toContain("No open notes");
  });
});

describe("pageLabelFor", () => {
  it.each([
    ["/org/events/abc/riders", "Riders step"],
    ["/org/events/abc/officials", "Officials step"],
    ["/org/events/abc/event", "Event step"],
    ["/org/events/abc/divisions", "Divisions step"],
    ["/org", "Events list"],
    ["/org/settings", "Organisation settings"],
    ["/admin", "Admin · Organisations"],
    ["/admin/feedback", "Admin · Feedback"],
    ["/e/arrow/register", "Registration page"],
    ["/something/else", "/something/else"],
  ])("%s → %s", (path, label) => expect(pageLabelFor(path)).toBe(label));
});
