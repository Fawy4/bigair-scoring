import { judgeTrickScore, panelScore, roundHalfUp, type PanelInput } from "@/lib/engine/scoring";
import { farthestJudge } from "@/lib/engine/scoring/outlier";
import type { LabelModel } from "@/lib/identification/rider-label";
import type { ScoringModel } from "@/lib/schemas/scoring-model";
import { markOf } from "./heat-input";
import { formatCell, type CellState, type MatrixCell, type MatrixRow, type PanelState, type PendingMatrixRow } from "./matrix-model";
import { consoleRows, lineOfSlot, type SheetAttempt } from "./rider-sheet";
import type { AttemptRow, FlagRow, PendingRow, ScoreRow } from "./types";

/** A row of the head judge's table with what the console needs to act on it. */
export type LiveMatrixRow = MatrixRow & {
  /** The rider (the entry id). */
  riderKey: string;
  attemptId: string;
  /** Flags a judge raised on this attempt that nobody has resolved yet. */
  openFlags: FlagRow[];
  possibleDuplicateOf: string | null;
};
export interface LiveMatrix {
  judgeIds: string[];
  rows: LiveMatrixRow[];
  /** Pending rows (Rider sheet notes with no attempt yet), per rider after the attempts: never counted. */
  pending: PendingMatrixRow[];
}

const two = (n: number) => roundHalfUp(n, 2).toFixed(2);

/**
 * The head judge's score table from the stored rows of one heat (docs/08 §1H-1): attempts in the order they were logged, one cell per panel judge, and the
 * panel score from the engine's own panel maths. A cell's word tells the head judge what is wrong: missing (nothing yet), missed (the judge did not see it),
 * absent (the head judge marked the judge absent for the attempt), crash, deleted.
 */
export function buildMatrix(input: {
  model: ScoringModel;
  panelSeatIds: string[];
  attempts: AttemptRow[];
  scores: ScoreRow[];
  flags: FlagRow[];
  labelFor: (entryId: string) => LabelModel;
  /** Notes typed on the Rider sheet that still wait for their attempt (the head judge, an observer and an organiser read them all). */
  pending?: PendingRow[];
  /** The riders of the heat in seat order: pending rows follow it. */
  riderOrder?: string[];
}): LiveMatrix {
  const { model, panelSeatIds, scores, flags } = input;
  const attempts = [...input.attempts].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.seq - b.seq);
  const rows = attempts.map((a): LiveMatrixRow => {
    const crash = a.status === "crashed";
    const deleted = a.deleted_at !== null;
    const own = scores.filter((s) => s.attempt_id === a.id);
    const values = new Map<string, number>();
    const inputs: PanelInput[] = [];
    const answers = panelSeatIds.map((seat) => {
      const s = own.find((x) => x.judge_seat_id === seat);
      const mark = markOf(model, s);
      if (mark === "missed") {
        inputs.push({ judgeId: seat, score: "missed" });
        return { seat, kind: s?.edit_reason === "Absent" ? ("absent" as const) : ("missed" as const) };
      }
      if (mark === undefined) return { seat, kind: "missing" as const };
      try {
        const v = judgeTrickScore(model, mark).score;
        values.set(seat, v);
        inputs.push({ judgeId: seat, score: v });
        return { seat, kind: "scored" as const };
      } catch {
        return { seat, kind: "missing" as const };
      }
    });
    const panel = crash || deleted ? null : panelScore(model, inputs, panelSeatIds);
    const scored = [...values.entries()].map(([judgeId, score]) => ({ judgeId, score }));
    const out = panel?.outlier ? farthestJudge(scored) : null;
    const cells: MatrixCell[] = answers.map(({ seat, kind }) => {
      const v = values.get(seat) ?? null;
      let state: CellState;
      if (deleted) state = "deleted";
      else if (crash) state = "crash";
      else if (kind === "scored") state = seat === out ? "outlier" : "scored";
      else state = kind;
      const shown = v !== null && (state === "scored" || state === "outlier" || state === "deleted");
      return { judgeId: seat, state, value: state === "deleted" || state === "crash" ? null : v, label: shown ? formatCell(v!) : "—" };
    });
    const panelState: PanelState = !panel || panel.score === null ? "none" : panel.incomplete ? "incomplete" : panel.outlier ? "outlier" : "ok";
    return {
      id: a.id,
      attemptId: a.id,
      riderKey: a.entry_id,
      seq: a.seq,
      label: input.labelFor(a.entry_id),
      trick: a.trick_name ?? "",
      status: a.status,
      state: deleted ? "deleted" : a.possible_duplicate_of ? "duplicate" : "ok",
      cells,
      panel: panel?.score ?? null,
      panelLabel: panel?.score == null ? "—" : two(panel.score),
      panelState,
      openFlags: flags.filter((f) => f.attempt_id === a.id && !f.resolved_at),
      possibleDuplicateOf: a.possible_duplicate_of,
    };
  });
  return { judgeIds: panelSeatIds, rows, pending: pendingRows(input.attempts, input.pending ?? [], panelSeatIds, input.labelFor, input.riderOrder ?? []) };
}

/** One pending row per rider and line that holds a note, after the attempts logged. Only panel judges' notes show; none of it reaches the panel score. */
export function pendingRows(attempts: AttemptRow[], notes: PendingRow[], panelSeatIds: string[], labelFor: (entryId: string) => LabelModel, riderOrder: string[]): PendingMatrixRow[] {
  const panel = new Set(panelSeatIds);
  const riders = [...new Set(notes.filter((n) => panel.has(n.judge_seat_id)).map((n) => n.entry_id))];
  const rank = (id: string) => (riderOrder.indexOf(id) < 0 ? riderOrder.length : riderOrder.indexOf(id));
  riders.sort((a, b) => rank(a) - rank(b));
  const out: PendingMatrixRow[] = [];
  for (const riderKey of riders) {
    const sheet: SheetAttempt[] = attempts.filter((a) => a.entry_id === riderKey).map((a) => ({ id: a.id, seq: a.seq, status: a.status, trickName: a.trick_name, direction: a.direction, deleted: Boolean(a.deleted_at) }));
    const mine = notes.filter((n) => n.entry_id === riderKey && panel.has(n.judge_seat_id)).map((n) => ({ seatId: n.judge_seat_id, slot: n.slot, score: Number(n.score) }));
    for (const row of consoleRows(sheet, mine)) {
      out.push({
        kind: "pending",
        id: `pending:${riderKey}:${row.n}`,
        riderKey,
        label: labelFor(riderKey),
        n: row.n,
        judgeIds: panelSeatIds.filter((j) => row.judges.includes(j)),
        cells: panelSeatIds.map((judgeId) => {
          const v = row.cells[judgeId];
          const note = notes.find((n) => n.entry_id === riderKey && n.judge_seat_id === judgeId && lineOfSlot(sheet, n.slot) === row.n);
          return { judgeId, value: v === undefined ? null : v, label: v === undefined ? "—" : formatCell(v), noteId: note?.id ?? null };
        }),
      });
    }
  }
  return out;
}
