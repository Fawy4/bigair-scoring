// Audit 1b, part 3b — the review bar and the Impression card against awkward panels (docs/AUDIT.md). The Gouna panel: J1, J2, J3 and the head judge (4 seats).
import { describe, expect, it } from "vitest";
import { CARD_ROW_MIN, fitCard, impressionGrid } from "./impression-card";
import { impressionStatus } from "./impression-status";
import type { ImpressionRow, SlotRow } from "./types";

const seats = ["j1", "j2", "j3", "hj"];
const slot = (position: number, entry: string, modifier: string | null = null) => ({ position, entry_id: entry, modifier }) as unknown as SlotRow;
const imp = (seat: string, entry: string, value: number | null, missed = false) => ({ judge_seat_id: seat, entry_id: entry, value, missed }) as unknown as ImpressionRow;
const words = { missing: "—", absent: "Absent" };

describe("A1b 3b — Impression card", () => {
  it("a judge who never gave an Impression: every cell '—', counted as missing, and the panel mean is the other three judges' only", () => {
    const slots = ["r", "y", "b"].map((e, i) => slot(i + 1, e));
    const rows = ["j1", "j2", "hj"].flatMap((s, k) => ["r", "y", "b"].map((e) => imp(s, e, 6 + k)));
    const status = impressionStatus({ panelSeatIds: seats, slots, impressions: rows });
    expect(status.find((j) => j.seatId === "j3")!.missing).toBe(3);
    const grid = impressionGrid({ impressions: status, riderOrder: ["r", "y", "b"], tolerance: 15, words });
    for (const row of grid) {
      expect(row.cells.find((c) => c.seatId === "j3")).toMatchObject({ state: "missing", label: "—", tone: null });
      expect(row.panel).toBeCloseTo((6 + 7 + 8) / 3, 10);
    }
  });

  it("a judge marked Absent: 'Absent' (never a colour alone), not in the mean, not missing", () => {
    const slots = [slot(1, "r")];
    const status = impressionStatus({ panelSeatIds: seats, slots, impressions: [imp("j1", "r", 7), imp("j2", "r", 8), imp("j3", "r", null, true), imp("hj", "r", 9)] });
    expect(status.find((j) => j.seatId === "j3")!.missing).toBe(0);
    const [row] = impressionGrid({ impressions: status, riderOrder: ["r"], tolerance: 15, words });
    expect(row.cells.find((c) => c.seatId === "j3")).toMatchObject({ state: "absent", label: "Absent", value: null });
    expect(row.panel).toBe(8);
  });

  it("riders who did not start or were disqualified need no Impression; a rider who did not finish does", () => {
    const slots = [slot(1, "r"), slot(2, "y", "DNS"), slot(3, "b", "DSQ"), slot(4, "g", "DNF")];
    const status = impressionStatus({ panelSeatIds: seats, slots, impressions: [] });
    expect(status[0].cells.map((c) => c.entryId)).toEqual(["r", "g"]);
  });

  it("a 5-rider heat with 4 judges at 1280 px: the card never asks for more room than the reserved row; it becomes the button", () => {
    // at 1280 px the room beside five rider cards is narrow; even a generous width cannot fit five rows into the reserved height
    for (const availW of [200, 420, 800]) expect(fitCard({ availW, availH: CARD_ROW_MIN, riders: 5, judges: 4 })).toBe("button");
    expect(fitCard({ availW: 800, availH: CARD_ROW_MIN, riders: 3, judges: 4 })).not.toBe("button");
  });
});
