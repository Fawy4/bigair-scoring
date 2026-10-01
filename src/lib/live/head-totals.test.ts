// Provisional rider totals (docs/PLAN-phase-5 step 1): KOTA docs/08 §1A, Red = 31.54 = tricks 24.04 + Impression 7.50, 78.85 %.
import { describe, expect, it } from "vitest";
import kotaJson from "../../../presets/scoring/kota-best3-impression.json";
import { parseScoringModel } from "@/lib/schemas/scoring-model";
import { riderTotals } from "./head-totals";
import type { AttemptRow, ImpressionRow, ScoreRow, SlotRow } from "./types";

const kota = parseScoringModel(structuredClone(kotaJson));
const seats = ["J1", "J2", "J3"];
const c = (height: number, extremity: number, technicality: number, execution: number) => ({ height, extremity, technicality, execution });
const rows: Array<[number, "landed" | "crashed", string, string, number[][]]> = [
  [1, "landed", "Kiteloop board-off", "board_off", [[8.0, 7.5, 7.0, 8.0], [8.5, 8.0, 7.0, 7.5], [8.0, 7.5, 7.5, 8.0]]],
  [2, "landed", "Double loop", "kiteloop", [[9.0, 9.0, 8.0, 7.0], [9.0, 8.5, 8.0, 7.5], [8.5, 9.0, 8.5, 7.0]]],
  [3, "landed", "Late backroll kiteloop", "kiteloop", [[7.0, 7.0, 6.5, 8.5], [7.5, 7.0, 7.0, 8.0], [7.0, 6.5, 7.0, 8.5]]],
  [4, "crashed", "Board-off", "board_off", []],
  [5, "landed", "Contra loop", "kiteloop", [[8.5, 8.0, 7.5, 8.5], [8.0, 8.0, 8.0, 8.0], [8.5, 8.5, 7.5, 8.0]]],
];
const slot = (entry: string, position: number, modifier: string | null = null): SlotRow => ({ id: `s${position}`, heat_id: "h", position, entry_id: entry, vest_colour: null, modifier, flagged_out: false, updated_at: "" });
const attempt = (entry: string, seq: number, status: "landed" | "crashed", name: string, cat: string): AttemptRow => ({
  id: `${entry}-${seq}`, heat_id: "h", entry_id: entry, seq, client_key: `${entry}${seq}`, direction: "left", category_key: cat, trick_name: name, trick_parts: {}, status,
  created_by_seat: null, created_at: `2026-10-01T10:00:0${seq}Z`, deleted_at: null, possible_duplicate_of: null, input_method: "builder", raw_text: null, updated_at: "",
});
const attempts = rows.map(([seq, st, n, cat]) => attempt("red", seq, st, n, cat));
const scores: ScoreRow[] = rows.flatMap(([seq, , , , marks]) => marks.map((m, i) => ({ id: `${seq}${i}`, attempt_id: `red-${seq}`, heat_id: "h", judge_seat_id: seats[i], score: null, missed: false, criteria: c(m[0], m[1], m[2], m[3]), client_rev: 1, version: 1, edit_reason: null, updated_at: "" })));
const imp = (v: number[]): ImpressionRow[] => v.map((value, i) => ({ id: `i${i}`, heat_id: "h", entry_id: "red", judge_seat_id: seats[i], value, client_rev: 1, updated_at: "" }));

describe("riderTotals", () => {
  it("Red: 31.54 = tricks 24.04 + Impression 7.50, 78.85 % of maximum when the division shows percentages", () => {
    const [red] = riderTotals(kota, seats, [slot("red", 1)], attempts, scores, imp([7.5, 7.0, 8.0]), true);
    expect(red).toMatchObject({ entryId: "red", place: 1, totalLabel: "31.54", formula: "31.54 = tricks 24.04 + Impression 7.50", percentLabel: "78.85 % of maximum", attempts: 5, incomplete: false });
  });
  it("no percentage unless the division asks for it", () => {
    expect(riderTotals(kota, seats, [slot("red", 1)], attempts, scores, imp([7.5, 7.0, 8.0]))[0].percentLabel).toBeNull();
  });
  it("while a judge still owes an Impression score the number can change: incomplete", () => {
    const [red] = riderTotals(kota, seats, [slot("red", 1)], attempts, scores, imp([7.5, 7.0]));
    expect(red.incomplete).toBe(true);
    expect(red.totalLabel).toBe("31.29"); // Impression from J1 and J2 only: 7.25 (docs/08 §1F)
  });
  it("nothing scored yet: no formula; a rider who did not start has no total", () => {
    const totals = riderTotals(kota, seats, [slot("red", 1), slot("blue", 2, "DNS")], attempts.slice(0, 0), [], []);
    expect(totals.find((t) => t.entryId === "red")?.formula).toBeNull();
    expect(totals.find((t) => t.entryId === "blue")?.totalLabel).toBe("—");
  });
  it("riders are listed in provisional rank order", () => {
    const blueAttempts = [attempt("blue", 1, "landed", "Backroll", "rotation")];
    const blueScores: ScoreRow[] = seats.map((s, i) => ({ id: `b${i}`, attempt_id: "blue-1", heat_id: "h", judge_seat_id: s, score: null, missed: false, criteria: c(5, 5, 5, 5), client_rev: 1, version: 1, edit_reason: null, updated_at: "" }));
    const totals = riderTotals(kota, seats, [slot("blue", 1), slot("red", 2)], [...blueAttempts, ...attempts], [...blueScores, ...scores], imp([7.5, 7.0, 8.0]));
    expect(totals.map((t) => t.entryId)).toEqual(["red", "blue"]);
  });
});
