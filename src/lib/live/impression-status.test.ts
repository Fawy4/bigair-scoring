import { describe, expect, it } from "vitest";
import { impressionStatus } from "./impression-status";
import type { ImpressionRow, SlotRow } from "./types";

// Polish 2, item 5: after a heat ends, each judge's Impression / Variety scores per rider: done / missing / Absent, so the head judge sees at a glance what
// holds the panel back. Riders who did not start or were disqualified need none (as the scoring engine says).
const slot = (entry: string, position: number, modifier: string | null = null): SlotRow => ({ id: entry, heat_id: "h", position, entry_id: entry, vest_colour: entry, modifier, flagged_out: false, updated_at: "" });
const imp = (entry: string, judge: string, value: number | null, missed = false): ImpressionRow => ({ id: `${entry}${judge}`, heat_id: "h", entry_id: entry, judge_seat_id: judge, value, missed, client_rev: 1, updated_at: "" });
const slots = [slot("red", 1), slot("blue", 2), slot("green", 3, "DNS")];

describe("Impression / Variety scores per judge and rider", () => {
  it("J1 has both, J2 has Red only, J3 is Absent for Blue: done / missing / Absent in rider order; the DNS rider is left out", () => {
    const s = impressionStatus({ panelSeatIds: ["J1", "J2", "J3"], slots, impressions: [imp("red", "J1", 7), imp("blue", "J1", 6.5), imp("red", "J2", 7.5), imp("blue", "J3", null, true), imp("red", "J3", 8)] });
    expect(s.map((j) => [j.seatId, j.cells.map((c) => `${c.entryId}:${c.state}${c.value === null ? "" : `:${c.value}`}`), j.missing])).toEqual([
      ["J1", ["red:done:7", "blue:done:6.5"], 0],
      ["J2", ["red:done:7.5", "blue:missing"], 1],
      ["J3", ["red:done:8", "blue:absent"], 0],
    ]);
  });
  it("a judge with nothing yet: every rider missing", () => {
    const s = impressionStatus({ panelSeatIds: ["J1"], slots, impressions: [] });
    expect(s[0].missing).toBe(2);
    expect(s[0].cells.every((c) => c.state === "missing")).toBe(true);
  });
  it("a rider who did not finish still needs one; a disqualified rider does not", () => {
    const s = impressionStatus({ panelSeatIds: ["J1"], slots: [slot("red", 1, "DNF"), slot("blue", 2, "DSQ")], impressions: [] });
    expect(s[0].cells.map((c) => c.entryId)).toEqual(["red"]);
  });
});
