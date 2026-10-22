import { describe, expect, it } from "vitest";
import { buildRiderReport, type ReportData } from "@/lib/engine/report";
import { scenario } from "@/lib/engine/report/scenario";
import { gapText, goalText, highlightText, points, strategyText, strengthText, trainText, clock, ordinal } from "./report-text";
import { reportAvailable, reportContextFrom } from "./rider-report";
import { copy } from "@/lib/ui-copy";
import { parseEventSettings } from "@/lib/schemas/event-settings";
import type { PublicRules } from "./types";

const data = (): ReportData => scenario().data;
const rep = (ctx = scenario()) => {
  const r = buildRiderReport(ctx, "a");
  if (r.status !== "ok") throw new Error("no report");
  return r;
};

describe("rider reports: the setting", () => {
  it("is Off for every event, old and new, and an unknown value is not a way round that", () => {
    expect(parseEventSettings({}).riderReports).toBe("off");
    expect(parseEventSettings({ publicLiveScores: "live" }).riderReports).toBe("off");
    expect(parseEventSettings({ riderReports: "after_heat" }).riderReports).toBe("after_heat");
    expect(parseEventSettings({ riderReports: "after_event" }).riderReports).toBe("after_event");
    expect(parseEventSettings({ riderReports: "always" }).riderReports).toBe("off");
  });
  it("has the three choices of the brief, in words", () => {
    expect(copy.event.riderReportsOptions).toEqual({ off: "Off", after_heat: "After each heat", after_event: "When the event is complete" });
  });
});

describe("rider reports: who has a report to open", () => {
  it("a rider with a published heat does; one without a heat, one under 18 and an unknown rider do not; nor does a closed event", () => {
    const d = data();
    expect(reportAvailable(d, "a")).toBe(true);
    expect(reportAvailable(null, "a")).toBe(false);
    expect(reportAvailable(d, "zzz")).toBe(false);
    d.entries = d.entries.map((e) => (e.id === "b" ? { ...e, report_withheld: true } : e));
    expect(reportAvailable(d, "b")).toBe(false);
    const empty = data();
    empty.divisions[0].rounds.forEach((r) => (r.heats = []));
    expect(reportAvailable(empty, "a")).toBe(false);
  });
});

describe("rider reports: the context comes from the event, not from the code", () => {
  const rules = (impression: string): PublicRules =>
    ({ allowed: true, divisions: [{ id: "div", name: "Pro", description: null, identification: null, scoring_model: { id: "m", name: "M", version: 1, trick: { entry: "single", scale: { min: 0, max: 10, step: 0.1 } }, panel: {}, heat: { counting: { type: "best_n", n: 3 }, impression: { label: impression, scale: { min: 0, max: 10, step: 0.1 }, weight: 1 }, total: {}, maxAttemptsPerRider: 6 }, categories: [{ key: "rotation", label: "Rotations" }], modifiers: { interference: { penalty: "none" }, dns: { placing: "last", total: 0 }, dnf: {}, dsq: { placing: "last", total: 0 } } }, scoring_overrides: {}, format_template: null, format_params: {}, riders: 6 }] }) as unknown as PublicRules;
  it("sides: the labels of the event's direction blocks (In / Out here)", () => {
    const ctx = reportContextFrom(data(), null, null);
    expect(ctx.sideWords).toEqual({ left: "In", right: "Out" });
  });
  it("sides in an event that says Left and Right", () => {
    const d = data();
    d.blocks = d.blocks.map((b) => (b.id === "direction:left" ? { ...b, label: "Left" } : b.id === "direction:right" ? { ...b, label: "Right" } : b));
    expect(reportContextFrom(d, null, null).sideWords).toEqual({ left: "Left", right: "Right" });
  });
  it("attempt limit, counting and the score name come from the division's scoring", () => {
    const ctx = reportContextFrom(data(), rules("Impression"), null);
    expect(ctx.divisionRules.div).toMatchObject({ attemptCap: 6, countedN: 3, impressionName: "Impression", weighted: false });
    expect(ctx.familyLabels).toEqual({ rotation: "Rotations" });
  });
  it("the event's own name for the score wins over the division's", () => {
    const d = data();
    d.impression_name = "Flow";
    expect(reportContextFrom(d, rules("Impression"), null).impressionName).toBe("Flow");
  });
});

describe("rider reports: the words follow the event (item 3)", () => {
  it("an event using Impression and In / Out: Impression and In / Out are what the page says, and Variety, Left and Right never appear", () => {
    const r = rep();
    const text = [
      ...r.highlights.map((h) => highlightText(h, r)),
      r.takeaways.strength ? strengthText(r.takeaways.strength) : "",
      r.takeaways.train ? trainText(r.takeaways.train, r) : "",
      r.takeaways.strategy ? strategyText(r.takeaways.strategy) : "",
      ...r.goals.map((g) => goalText(g, r)),
      ...r.compare.map((c) => (typeof copy.report.compare[c.key] === "function" ? (copy.report.compare[c.key] as (n: string) => string)(r.scoreName) : String(copy.report.compare[c.key]))),
    ].join(" | ");
    expect(text).toContain("Impression score");
    expect(text).toContain("twice In");
    for (const word of ["Variety", "Left", "Right"]) expect(text).not.toContain(word);
  });
  it("an event using Variety and Left / Right says those instead", () => {
    const c = scenario();
    c.impressionName = "Variety";
    c.sideWords = { left: "Left", right: "Right" };
    const r = rep(c);
    expect((copy.report.compare.impression as (n: string) => string)(r.scoreName)).toBe("Variety score");
    expect(trainText(r.takeaways.train!, r)).toContain("both times Left");
    expect(trainText(r.takeaways.train!, r)).not.toContain("IN");
  });
});

describe("rider reports: small formatters", () => {
  it("places, clock times and distances", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
    expect(clock(67)).toBe("1:07");
    expect(clock(0)).toBe("0:00");
    expect(clock(null)).toBe("–");
    expect([0.4, 2, 1.6, 0.43].map(points)).toEqual(["0.4", "2.0", "1.6", "0.43"]);
  });
  it("joint places read 'Joint 5th'", () => {
    expect(copy.report.place("5th", true)).toBe("Joint 5th");
    expect(copy.report.place("5th", false)).toBe("5th");
    expect(copy.report.outIn("Round 3")).toBe("Out in Round 3");
  });
  it("the gap line reads as the owner wrote it", () => {
    expect(gapText({ heatId: "h", heatLabel: "x", miss: 0.4, toRound: "Final", needAbove: 2, replaces: 1.6, rank: 3 })).toBe(
      "You missed the Final by 0.4 points. One more trick scoring above 2.0, in place of your third best (1.6), would have taken you through.",
    );
  });
});
