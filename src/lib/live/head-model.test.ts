import { describe, expect, it } from "vitest";
import { buildHeadModel } from "./head-model";
import type { AttemptRow, ImpressionRow, ScoreRow, SheetRow, SlotRow } from "./types";
import { preset } from "@/lib/engine/scoring/fixtures";
import type { LabelModel } from "@/lib/identification/rider-label";

// docs/08 §1H-1, §1H-3, §1H-7 and §1G-14 together: the head judge's view of one heat
const model = preset("kota-best3-impression", (m) => {
  m.tieBreakers = ["highest_counted_trick", "next_counted_trick", "impression", "head_judge"];
});
const PANEL = ["J1", "J2", "J3"];
const hetx = (h: number, e: number, t: number, x: number) => ({ height: h, extremity: e, technicality: t, execution: x });
const label = (id: string) => ({ primary: { key: "vest", text: id.toUpperCase() }, secondary: [] }) as unknown as LabelModel;
const word = (id: string) => ({ red: "Red", blue: "Blue" })[id] ?? id;
const RED = [
  [hetx(8.0, 7.5, 7.0, 8.0), hetx(8.5, 8.0, 7.0, 7.5), hetx(8.0, 7.5, 7.5, 8.0)],
  [hetx(9.0, 9.0, 8.0, 7.0), hetx(9.0, 8.5, 8.0, 7.5), hetx(8.5, 9.0, 8.5, 7.0)],
  [hetx(7.0, 7.0, 6.5, 8.5), hetx(7.5, 7.0, 7.0, 8.0), hetx(7.0, 6.5, 7.0, 8.5)],
  null,
  [hetx(8.5, 8.0, 7.5, 8.5), hetx(8.0, 8.0, 8.0, 8.0), hetx(8.5, 8.5, 7.5, 8.0)],
];
const slot = (entry: string, position: number): SlotRow => ({ id: `s-${entry}`, heat_id: "h", position, entry_id: entry, vest_colour: entry, modifier: null, flagged_out: false, updated_at: "" });
const attempt = (entry: string, seq: number, status: "landed" | "crashed" = "landed"): AttemptRow => ({
  id: `${entry}-${seq}`, heat_id: "h", entry_id: entry, seq, client_key: `${entry}${seq}`, direction: "left", category_key: null, trick_name: `Trick ${seq}`, trick_parts: {}, status,
  created_by_seat: "S", created_at: new Date(Date.UTC(2026, 9, 2, 10, seq)).toISOString(), deleted_at: null, possible_duplicate_of: null, input_method: "builder", raw_text: null, updated_at: "",
});
const score = (a: string, judge: string, criteria: object): ScoreRow => ({ id: `${a}-${judge}`, attempt_id: a, heat_id: "h", judge_seat_id: judge, score: null, missed: false, criteria, client_rev: 1, version: 1, edit_reason: null, updated_at: "" });
const imp = (entry: string, judge: string, value: number): ImpressionRow => ({ id: `${entry}-${judge}`, heat_id: "h", entry_id: entry, judge_seat_id: judge, value, client_rev: 1, updated_at: "" });
const sheet = (judge: string): SheetRow => ({ id: `sh-${judge}`, heat_id: "h", judge_seat_id: judge, submitted_at: "2026-10-02T10:30:00Z", reopened_at: null, updated_at: "" });

function red(opts: { skipJ3Impression?: boolean } = {}) {
  const attempts = RED.map((_, i) => attempt("red", i + 1, RED[i] ? "landed" : "crashed"));
  const scores = RED.flatMap((m, i) => (m ? m.map((c, j) => score(`red-${i + 1}`, PANEL[j], c)) : []));
  const impressions = [7.5, 7.0, 8.0].flatMap((v, j) => (opts.skipJ3Impression && j === 2 ? [] : [imp("red", PANEL[j], v)]));
  return { attempts, scores, impressions };
}
const build = (over: Partial<Parameters<typeof buildHeadModel>[0]> = {}) => {
  const r = red();
  return buildHeadModel({ model, panelSeatIds: PANEL, slots: [slot("red", 1)], attempts: r.attempts, scores: r.scores, impressions: r.impressions, penalties: [], decisions: [], flags: [], sheets: PANEL.map(sheet), labelFor: label, wordFor: word, judgeWord: (id) => ({ J3: "Fawy" })[id as "J3"] ?? id, ...over });
};

describe("the head judge's model of one heat", () => {
  it("§1A complete: panel column, 31.54 = tricks 24.04 + Impression 7.50, rank 1, nothing blocks Publish", () => {
    const m = build();
    expect(m.matrix.rows.map((r) => r.panelLabel)).toEqual(["7.71", "8.25", "7.29", "—", "8.08"]);
    expect(m.totals[0]).toMatchObject({ place: 1, totalLabel: "31.54", formula: "31.54 = tricks 24.04 + Impression 7.50" });
    expect(m.checklist.items).toEqual([]);
    expect(m.owes).toEqual([]);
    expect(m.error).toBeNull();
  });
  it("J3's Impression score missing: Fawy owes it for Red, and Publish says so in words", () => {
    const r = red({ skipJ3Impression: true });
    const m = build({ impressions: r.impressions });
    expect(m.owes).toEqual([{ seatId: "J3", judgeNo: 3, judge: "Fawy", entryId: "red" }]);
    expect(m.checklist.items.map((i) => i.text)).toEqual(["Fawy has no Impression / Variety score for Red"]);
  });
  it("a judge who has not submitted blocks Publish: 'Fawy has not submitted'", () => {
    const m = build({ sheets: [sheet("J1"), sheet("J2")] });
    expect(m.unsubmitted).toEqual(["J3"]);
    expect(m.checklist.items.map((i) => i.text)).toEqual(["Fawy has not submitted"]);
  });
  it("two riders tied on everything: 'Red and Blue are tied — choose the order', not overridable; a decision turns it into words", () => {
    const blueAttempts = RED.map((_, i) => attempt("blue", i + 1, RED[i] ? "landed" : "crashed"));
    const blueScores = RED.flatMap((m, i) => (m ? m.map((c, j) => score(`blue-${i + 1}`, PANEL[j], c)) : []));
    const base = red();
    const both = { slots: [slot("red", 1), slot("blue", 2)], attempts: [...base.attempts, ...blueAttempts], scores: [...base.scores, ...blueScores], impressions: [...base.impressions, ...[7.5, 7.0, 8.0].map((v, j) => imp("blue", PANEL[j], v))] };
    const tied = build(both);
    expect(tied.ties.map((t) => t.text)).toEqual(["Red and Blue are tied — choose the order"]);
    expect(tied.checklist.canOverride).toBe(false);
    const chosen = build({ ...both, decisions: [{ riderIds: ["blue", "red"], reason: "paper sheet" }] });
    expect(chosen.ties.map((t) => t.text)).toEqual(["Blue ahead of Red: head judge's decision — paper sheet"]);
    expect(chosen.checklist.items).toEqual([]);
  });
  it("a rider who did not start ranks last with no total", () => {
    const m = build({ slots: [slot("red", 1), { ...slot("blue", 2), modifier: "DNS" }] });
    expect(m.totals.map((t) => [t.entryId, t.place, t.totalLabel])).toEqual([["red", 1, "31.54"], ["blue", 2, "—"]]);
  });
  it("the agreement report and the flag-out candidates ride along", () => {
    const m = build({ flagOutCount: 1 });
    expect(m.agreement.map((a) => a.meanDistance.toFixed(2))).toEqual(["0.04", "0.05", "0.03"]);
    expect(m.flagOut?.riders).toEqual(["red"]);
  });
});
