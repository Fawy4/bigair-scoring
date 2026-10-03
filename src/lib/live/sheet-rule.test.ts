import { describe, expect, it } from "vitest";
import { effectiveUnsubmitted } from "./sheet-rule";
import type { ImpressionRow, ScoreRow, SheetRow } from "./types";

// Polish 2, item 1 (decision P2-1): a judge whose sheet was never submitted counts as submitted for Publish when nothing of theirs is missing any more
// and the head judge has marked at least one of their scores Absent (a trick score or an Impression / Variety score). Typed-in values alone do not count.
const PANEL = ["J1", "J2", "J3"];
const sheet = (judge: string, submitted = true, reopened = false): SheetRow => ({ id: judge, heat_id: "h", judge_seat_id: judge, submitted_at: submitted ? "2026-10-02T10:30:00Z" : null, reopened_at: reopened ? "2026-10-02T10:40:00Z" : null, updated_at: "" });
const absent = (judge: string): ScoreRow => ({ id: `a-${judge}`, attempt_id: "a1", heat_id: "h", judge_seat_id: judge, score: null, missed: true, criteria: {}, client_rev: 1, version: 1, edit_reason: "Absent", updated_at: "" });
const typed = (judge: string): ScoreRow => ({ ...absent(judge), missed: false, score: 7, edit_reason: "paper sheet" });
const ownMissed = (judge: string): ScoreRow => ({ ...absent(judge), edit_reason: null });
const impAbsent = (judge: string): ImpressionRow => ({ id: `i-${judge}`, heat_id: "h", entry_id: "red", judge_seat_id: judge, value: null, missed: true, client_rev: 1, updated_at: "" });

describe("which panel judges still hold Publish back for their sheet", () => {
  it("submitted sheets: nobody", () => {
    expect(effectiveUnsubmitted({ panelSeatIds: PANEL, sheets: PANEL.map((j) => sheet(j)), blockers: [], scores: [], impressions: [] })).toEqual([]);
  });
  it("J3 never submitted and nothing was marked: J3", () => {
    expect(effectiveUnsubmitted({ panelSeatIds: PANEL, sheets: [sheet("J1"), sheet("J2")], blockers: [], scores: [], impressions: [] })).toEqual(["J3"]);
  });
  it("J3 never submitted, the head judge set J3's missing trick score to Absent, nothing else missing: counts as submitted", () => {
    expect(effectiveUnsubmitted({ panelSeatIds: PANEL, sheets: [sheet("J1"), sheet("J2")], blockers: [], scores: [absent("J3")], impressions: [] })).toEqual([]);
  });
  it("…an Absent Impression / Variety score counts the same", () => {
    expect(effectiveUnsubmitted({ panelSeatIds: PANEL, sheets: [sheet("J1"), sheet("J2")], blockers: [], scores: [], impressions: [impAbsent("J3")] })).toEqual([]);
  });
  it("…but while one of J3's scores is still missing, J3 still holds Publish back", () => {
    const blockers = [{ type: "impression_missing" as const, judge: "J3", rider: "blue" }];
    expect(effectiveUnsubmitted({ panelSeatIds: PANEL, sheets: [sheet("J1"), sheet("J2")], blockers, scores: [absent("J3")], impressions: [] })).toEqual(["J3"]);
  });
  it("another judge's missing score does not hold J3 back", () => {
    const blockers = [{ type: "score_missing" as const, judge: "J1", rider: "red", attemptSeq: 1 }];
    expect(effectiveUnsubmitted({ panelSeatIds: PANEL, sheets: [sheet("J1"), sheet("J2")], blockers, scores: [absent("J3")], impressions: [] })).toEqual([]);
  });
  it("a typed-in value or the judge's own 'missed' is not the head judge's Absent: J3 still holds Publish back", () => {
    expect(effectiveUnsubmitted({ panelSeatIds: PANEL, sheets: [sheet("J1"), sheet("J2")], blockers: [], scores: [typed("J3")], impressions: [] })).toEqual(["J3"]);
    expect(effectiveUnsubmitted({ panelSeatIds: PANEL, sheets: [sheet("J1"), sheet("J2")], blockers: [], scores: [ownMissed("J3")], impressions: [] })).toEqual(["J3"]);
  });
  it("a re-opened sheet is not submitted; the Absent rule applies to it too", () => {
    const sheets = [sheet("J1"), sheet("J2"), sheet("J3", true, true)];
    expect(effectiveUnsubmitted({ panelSeatIds: PANEL, sheets, blockers: [], scores: [], impressions: [] })).toEqual(["J3"]);
    expect(effectiveUnsubmitted({ panelSeatIds: PANEL, sheets, blockers: [], scores: [absent("J3")], impressions: [] })).toEqual([]);
  });
});
