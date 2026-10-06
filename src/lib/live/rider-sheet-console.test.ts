import { describe, expect, it } from "vitest";
import { auditLine, isScoreChange, timeOfDay, type AuditRow } from "./audit-lines";
import { buildHeadModel } from "./head-model";
import { pendingBlockers, publishChecklist } from "./publish-checklist";
import type { AttemptRow, ImpressionRow, PendingRow, ScoreRow, SheetRow, SlotRow } from "./types";
import { preset } from "@/lib/engine/scoring/fixtures";
import type { LabelModel } from "@/lib/identification/rider-label";

// The head judge's console with Rider sheet notes: pending rows after the attempts, each judge's note in that judge's column, never counted; Publish blocked by name.
const model = preset("legacy-kol-best3-variety");
const PANEL = ["J1", "J2", "J3", "J4"];
const label = (id: string) => ({ primary: { key: "vest", text: id.toUpperCase() }, secondary: [] }) as unknown as LabelModel;
const slot = (entry: string, position: number): SlotRow => ({ id: `s-${entry}`, heat_id: "h", position, entry_id: entry, vest_colour: entry, modifier: null, flagged_out: false, updated_at: "" });
const attempt = (entry: string, seq: number, extra: Partial<AttemptRow> = {}): AttemptRow => ({
  id: `${entry}-${seq}`, heat_id: "h", entry_id: entry, seq, client_key: `${entry}${seq}`, direction: "left", category_key: null, trick_name: `Trick ${seq}`, trick_parts: {}, status: "landed",
  created_by_seat: "S", created_at: new Date(Date.UTC(2026, 9, 2, 10, seq)).toISOString(), deleted_at: null, possible_duplicate_of: null, input_method: "builder", raw_text: null, updated_at: "", ...extra,
});
const score = (a: string, judge: string, value: number): ScoreRow => ({ id: `${a}-${judge}`, attempt_id: a, heat_id: "h", judge_seat_id: judge, score: value, missed: false, criteria: {}, client_rev: 1, version: 1, edit_reason: null, updated_at: "" });
const imp = (entry: string, judge: string, value: number): ImpressionRow => ({ id: `${entry}-${judge}`, heat_id: "h", entry_id: entry, judge_seat_id: judge, value, missed: false, client_rev: 1, updated_at: "" });
const sheet = (judge: string): SheetRow => ({ id: `sh-${judge}`, heat_id: "h", judge_seat_id: judge, submitted_at: "2026-10-02T10:30:00Z", reopened_at: null, updated_at: "" });
const note = (entry: string, judge: string, slotNo: number, value: number): PendingRow => ({ id: `${entry}-${judge}-${slotNo}`, heat_id: "h", entry_id: entry, judge_seat_id: judge, slot: slotNo, score: value, client_rev: 1, updated_at: "" });

const attempts = [attempt("omar", 1), attempt("omar", 2)];
const scores = PANEL.flatMap((j, i) => [score("omar-1", j, 7 + i * 0.5), score("omar-2", j, 6 + i * 0.5)]);
const impressions = PANEL.map((j) => imp("omar", j, 6));
const build = (pending: PendingRow[], over: Partial<Parameters<typeof buildHeadModel>[0]> = {}) =>
  buildHeadModel({
    model, panelSeatIds: PANEL, slots: [slot("omar", 1), slot("sam", 2)], attempts, scores, impressions: [...impressions, ...PANEL.map((j) => imp("sam", j, 5))], penalties: [], decisions: [], flags: [], sheets: PANEL.map(sheet),
    labelFor: label, wordFor: (id) => id[0].toUpperCase() + id.slice(1), nameFor: (id) => ({ omar: "Omar Hassan", sam: "Sam Rivera" })[id as "omar"] ?? id, riderOrder: ["omar", "sam"], pending, ...over,
  });

describe("console: pending rows", () => {
  const pending = [note("omar", "J3", 3, 6), note("omar", "J1", 3, 7.5), note("omar", "J1", 4, 5)];

  it("one pending row per line after the logged attempts; each judge's note sits in that judge's column; judges without a note show a dash", () => {
    const rows = build(pending).matrix.pending;
    expect(rows.map((r) => [r.n, r.judgeIds, r.cells.map((c) => c.label)])).toEqual([
      [3, ["J1", "J3"], ["7.50", "—", "6.00", "—"]],
      [4, ["J1"], ["5.00", "—", "—", "—"]],
    ]);
  });

  it("each cell that holds a note carries the note's id (for the head judge's Clear); the others none", () => {
    const row = build(pending).matrix.pending[0];
    expect(row.cells.map((c) => c.noteId)).toEqual(["omar-J1-3", null, "omar-J3-3", null]);
  });

  it("pending notes are never counted: totals and panel scores are exactly what they are without them", () => {
    const without = build([]);
    const withNotes = build(pending);
    expect(withNotes.totals.map((t) => t.totalLabel)).toEqual(without.totals.map((t) => t.totalLabel));
    expect(withNotes.matrix.rows.map((r) => r.panelLabel)).toEqual(without.matrix.rows.map((r) => r.panelLabel));
    expect(withNotes.matrix.rows).toHaveLength(2); // the pending rows are not attempts
  });

  it("when the spotter logs, the first pending row becomes the attempt (it leaves the pending rows)", () => {
    const logged = build(pending.filter((n) => n.slot !== 3), { attempts: [...attempts, attempt("omar", 3)] });
    expect(logged.matrix.pending.map((r) => r.n)).toEqual([4]);
  });

  it("after a delete the pending rows shift up one line", () => {
    const deleted = build(pending, { attempts: [attempts[0], { ...attempts[1], deleted_at: "2026-10-02T10:05:00Z" }] });
    expect(deleted.matrix.pending.map((r) => r.n)).toEqual([2, 3]);
  });

  it("only the panel's notes show; riders follow the heat's order", () => {
    const m = build([note("sam", "J2", 1, 4), note("omar", "J9", 3, 5), note("omar", "J1", 3, 6)]);
    expect(m.matrix.pending.map((r) => [r.riderKey, r.n])).toEqual([["omar", 3], ["sam", 1]]);
  });
});

describe("console: Publish is blocked by name while a pending row remains", () => {
  const pending = [note("omar", "J3", 3, 6)];

  it("the blocker names the rider and the judge, and there is no override", () => {
    const m = build(pending);
    expect(m.checklist.items.map((i) => [i.kind, i.text])).toEqual([["pending", "Omar Hassan: J3 has a score with no attempt — ask J3 to clear it, or clear it here"]]);
    expect(m.checklist.canOverride).toBe(false);
  });

  it("one blocker per rider and judge, however many lines they hold; a second judge is a second blocker", () => {
    const m = build([...pending, note("omar", "J3", 4, 5), note("omar", "J1", 3, 5), note("sam", "J1", 1, 3)]);
    expect(m.checklist.items.map((i) => i.text)).toEqual(["Omar Hassan: J1 has a score with no attempt — ask J1 to clear it, or clear it here", "Omar Hassan: J3 has a score with no attempt — ask J3 to clear it, or clear it here", "Sam Rivera: J1 has a score with no attempt — ask J1 to clear it, or clear it here"]);
  });

  it("after Clear nothing blocks Publish and an override is possible again for other blockers", () => {
    const m = build([]);
    expect(m.checklist.items).toEqual([]);
    expect(m.checklist.canOverride).toBe(true);
  });

  it("a pending blocker comes after the missing scores and impression scores, before ties", () => {
    const r = publishChecklist({
      blockers: [
        { type: "tie_unresolved", riders: ["a", "b"] },
        { type: "score_missing", judge: "J2", rider: "a", attemptSeq: 1 },
      ] as never,
      unsubmitted: [],
      judgeWord: (j) => j,
      riderLabel: (r) => r,
      impressionLabel: "Variety score",
      pending: [{ riderId: "a", judgeId: "J1" }],
    });
    expect(r.items.map((i) => i.kind)).toEqual(["score", "pending", "tie"]);
  });

  it("the blockers list one entry per rider and judge on the panel only", () => {
    expect(pendingBlockers([{ entry_id: "a", judge_seat_id: "J2" }, { entry_id: "a", judge_seat_id: "J2" }, { entry_id: "a", judge_seat_id: "X" }], PANEL)).toEqual([{ riderId: "a", judgeId: "J2" }]);
  });
});

describe("audit: a judge changing their own score", () => {
  const w = { judgeWord: (s: string) => ({ J2: "J2" })[s] ?? "A judge", riderWord: () => "Omar", attemptWord: (a: string) => ({ a3: "attempt 3" })[a] ?? "", clock: (iso: string) => timeOfDay(iso, "Africa/Cairo") };
  const row = (extra: Partial<AuditRow>): AuditRow => ({ id: "x", action: "update", table_name: "trick_scores", reason: null, at: "2026-10-05T11:21:05Z", before: null, after: null, ...extra });
  it("reads 'J2 changed attempt 3 from 7.00 to 8.50 at 14:21:05' (Cairo time)", () => {
    const r = row({ before: { attempt_id: "a3", judge_seat_id: "J2", score: 7 }, after: { attempt_id: "a3", judge_seat_id: "J2", score: 8.5 } });
    expect(isScoreChange(r)).toBe(true);
    expect(auditLine(r, w)).toBe("J2 changed attempt 3 from 7.00 to 8.50 at 14:21:05");
  });
  it("the head judge clearing a note reads 'Head judge cleared J3's pending score on Omar Hassan line 4: <reason or no reason given>'", () => {
    const cleared = (reason: string | null) => row({ action: "pending_cleared_by_head", table_name: "pending_scores", reason, before: { judge_seat_id: "J2", entry_id: "omar", line: 4 }, after: null });
    const named = { ...w, riderName: () => "Omar Hassan" };
    expect(auditLine(cleared("phone died"), named)).toBe("Head judge cleared J2's pending score on Omar Hassan line 4: phone died");
    expect(auditLine(cleared(null), named)).toBe("Head judge cleared J2's pending score on Omar Hassan line 4: no reason given");
  });
  it("a save that changed no number is not a change; a score that came from a pending note says so", () => {
    expect(isScoreChange(row({ before: { score: 7 }, after: { score: 7, version: 2 } }))).toBe(false);
    expect(auditLine(row({ action: "score_from_note", before: null, after: { attempt_id: "a3", judge_seat_id: "J2", score: 7.5 } }), w)).toBe("J2 · attempt 3: 7.50 (typed before the attempt was logged)");
  });
});
