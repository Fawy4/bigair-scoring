import { describe, expect, it } from "vitest";
import { buildMatrix } from "./matrix";
import type { AttemptRow, FlagRow, ScoreRow } from "./types";
import { preset } from "@/lib/engine/scoring/fixtures";
import type { LabelModel } from "@/lib/identification/rider-label";

// docs/08 §1H-1 — §1A seen by the head judge
const model = preset("kota-best3-impression");
const PANEL = ["J1", "J2", "J3"];
const label = { primary: { key: "vest", text: "RED" }, secondary: [] } as unknown as LabelModel;
const hetx = (h: number, e: number, t: number, x: number) => ({ height: h, extremity: e, technicality: t, execution: x });

const T0 = Date.parse("2026-10-02T10:00:00Z");
function attempt(seq: number, status: "landed" | "crashed", over: Partial<AttemptRow> = {}): AttemptRow {
  return {
    id: `a${seq}`, heat_id: "h", entry_id: "red", seq, client_key: `k${seq}`, direction: "left", category_key: null, trick_name: `Trick ${seq}`, trick_parts: {},
    status, created_by_seat: "S", created_at: new Date(T0 + seq * 60_000).toISOString(), deleted_at: null, possible_duplicate_of: null, input_method: "builder", raw_text: null,
    updated_at: new Date(T0).toISOString(), ...over,
  };
}
function score(attemptId: string, judge: string, criteria: Record<string, number> | null, extra: Partial<ScoreRow> = {}): ScoreRow {
  return { id: `${attemptId}-${judge}`, attempt_id: attemptId, heat_id: "h", judge_seat_id: judge, score: null, missed: criteria === null, criteria: criteria ?? {}, client_rev: 1, version: 1, edit_reason: null, updated_at: "", ...extra };
}
const marks: Record<number, Array<Record<string, number>>> = {
  1: [hetx(8.0, 7.5, 7.0, 8.0), hetx(8.5, 8.0, 7.0, 7.5), hetx(8.0, 7.5, 7.5, 8.0)],
  2: [hetx(9.0, 9.0, 8.0, 7.0), hetx(9.0, 8.5, 8.0, 7.5), hetx(8.5, 9.0, 8.5, 7.0)],
  3: [hetx(7.0, 7.0, 6.5, 8.5), hetx(7.5, 7.0, 7.0, 8.0), hetx(7.0, 6.5, 7.0, 8.5)],
  5: [hetx(8.5, 8.0, 7.5, 8.5), hetx(8.0, 8.0, 8.0, 8.0), hetx(8.5, 8.5, 7.5, 8.0)],
};
const attempts = [attempt(1, "landed"), attempt(2, "landed"), attempt(3, "landed"), attempt(4, "crashed"), attempt(5, "landed")];
const allScores = (): ScoreRow[] => Object.entries(marks).flatMap(([seq, m]) => m.map((c, i) => score(`a${seq}`, PANEL[i], c)));
const build = (a: AttemptRow[], s: ScoreRow[], flags: FlagRow[] = []) => buildMatrix({ model, panelSeatIds: PANEL, attempts: a, scores: s, flags, labelFor: () => label });

describe("1H-1 buildMatrix", () => {
  it("§1A: the panel column reads 7.71 / 8.25 / 7.29 / crash / 8.08", () => {
    const m = build(attempts, allScores());
    expect(m.rows.map((r) => r.panelLabel)).toEqual(["7.71", "8.25", "7.29", "—", "8.08"]);
    expect(m.rows[3].cells.map((c) => c.state)).toEqual(["crash", "crash", "crash"]);
    expect(m.rows[3].panelState).toBe("none");
    expect(m.rows[0].cells.map((c) => c.label)).toEqual(["7.625", "7.75", "7.75"]);
    expect(m.judgeIds).toEqual(PANEL);
  });
  it("attempt 3 with J3 removed: missing cell, 7.31, incomplete", () => {
    const m = build(attempts, allScores().filter((s) => !(s.attempt_id === "a3" && s.judge_seat_id === "J3")));
    const row = m.rows[2];
    expect(row.cells[2].state).toBe("missing");
    expect(row.panelLabel).toBe("7.31");
    expect(row.panelState).toBe("incomplete");
  });
  it("with J3 Missed: the cell is missed, 7.31, complete", () => {
    const s = allScores().map((x) => (x.attempt_id === "a3" && x.judge_seat_id === "J3" ? score("a3", "J3", null) : x));
    const row = build(attempts, s).rows[2];
    expect(row.cells[2].state).toBe("missed");
    expect(row.panelLabel).toBe("7.31");
    expect(row.panelState).toBe("ok");
  });
  it("with J3 absent (Missed with the reason Absent): the cell is absent, complete", () => {
    const s = allScores().map((x) => (x.attempt_id === "a3" && x.judge_seat_id === "J3" ? score("a3", "J3", null, { edit_reason: "Absent" }) : x));
    const row = build(attempts, s).rows[2];
    expect(row.cells[2].state).toBe("absent");
    expect(row.panelState).toBe("ok");
  });
  it("a deleted attempt: deleted row, panel '—', left out", () => {
    const m = build(attempts.map((a) => (a.seq === 2 ? { ...a, deleted_at: "2026-10-02T10:30:00Z" } : a)), allScores());
    expect(m.rows[1]).toMatchObject({ state: "deleted", panelLabel: "—", panel: null });
  });
  it("a possible duplicate: the row says duplicate, the cells stay", () => {
    const m = build(attempts.map((a) => (a.seq === 5 ? { ...a, possible_duplicate_of: "a1" } : a)), allScores());
    expect(m.rows[4].state).toBe("duplicate");
    expect(m.rows[4].panelLabel).toBe("8.08");
  });
  it("outlier: 7.00 / 7.50 / 8.90 → panel 7.80, outlier row, J3's cell is the outlier", () => {
    const flat = (v: number) => hetx(v, v, v, v);
    const s = [score("a1", "J1", flat(7.0)), score("a1", "J2", flat(7.5)), score("a1", "J3", flat(8.9))];
    const row = build([attempts[0]], s).rows[0];
    expect(row.panelLabel).toBe("7.80");
    expect(row.panelState).toBe("outlier");
    expect(row.cells.map((c) => c.state)).toEqual(["scored", "scored", "outlier"]);
  });
  it("open flags ride on the row; resolved ones do not", () => {
    const f = (id: string, resolved: string | null): FlagRow => ({ id, heat_id: "h", attempt_id: "a4", judge_seat_id: "J1", kind: "landed", created_at: "", resolved_at: resolved, updated_at: "" });
    const row = build(attempts, allScores(), [f("f1", null), f("f2", "2026-10-02T10:40:00Z")]).rows[3];
    expect(row.openFlags.map((x) => x.id)).toEqual(["f1"]);
  });
  it("rows keep the order the attempts were logged in", () => {
    const shuffled = [attempts[4], attempts[0], attempts[2], attempts[1], attempts[3]];
    expect(build(shuffled, allScores()).rows.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5]);
  });
});
