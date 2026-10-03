import { panelScore, roundHalfUp, type PanelInput } from "@/lib/engine/scoring";
import { KOTA, type ConsoleRow } from "./design-fixtures";
import { formatCell, type MatrixCell, type MatrixRow, type PanelState } from "./matrix-model";
import { copy } from "@/lib/ui-copy";
import { DEFAULT_IMPRESSION_NAME } from "@/lib/schemas/impression-name";

/**
 * What the head judge's laptop console does to the numbers: edit a score, delete an attempt, a rider's DNS / DNF / DSQ / Interference, and the list of what
 * blocks Publish. Preview-only helpers over the table's cells, using the engine's own panel maths; the real server functions are built in 5c.
 */
const JUDGES = ["J1", "J2", "J3"];
const two = (n: number) => roundHalfUp(n, 2).toFixed(2);

function farthest(scores: Array<{ judgeId: string; score: number }>): string {
  const sorted = scores.map((s) => s.score).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return [...scores].sort((a, b) => Math.abs(b.score - median) - Math.abs(a.score - median))[0].judgeId;
}

/** The panel score and its state for a row's cells: a missing cell makes the row incomplete, a Missed or absent cell is left out, a wide spread is an outlier. */
export function panelOf(cells: MatrixCell[]): { panel: number | null; label: string; state: PanelState; outlierJudge: string | null } {
  const input: PanelInput[] = cells.flatMap((c): PanelInput[] =>
    c.state === "scored" || c.state === "outlier" ? [{ judgeId: c.judgeId, score: c.value as number }] : c.state === "missed" || c.state === "absent" ? [{ judgeId: c.judgeId, score: "missed" }] : [],
  );
  const p = panelScore(KOTA, input, JUDGES, KOTA.trick.scale);
  const scores = input.filter((i): i is { judgeId: string; score: number } => typeof i.score === "number");
  const state: PanelState = p.score === null ? "none" : p.incomplete ? "incomplete" : p.outlier ? "outlier" : "ok";
  return { panel: p.score, label: p.score === null ? "—" : two(p.score), state, outlierJudge: p.outlier ? farthest(scores) : null };
}

function relabel<R extends MatrixRow>(row: R, cells: MatrixCell[]): R {
  const p = panelOf(cells);
  return {
    ...row,
    cells: cells.map((c) => (c.state === "outlier" ? { ...c, state: "scored" as const } : c)).map((c) => (c.judgeId === p.outlierJudge ? { ...c, state: "outlier" as const } : c)),
    panel: p.panel,
    panelLabel: p.label,
    panelState: p.state === "none" ? "none" : p.state,
  };
}

/** One judge's score changed (with a reason, recorded elsewhere): the cell is scored, the panel score and the row's state follow. */
export function withCellScore<R extends MatrixRow>(row: R, judgeId: string, value: number): R {
  const cells = row.cells.map((c) => (c.judgeId === judgeId ? { ...c, state: "scored" as const, value, label: formatCell(value) } : c));
  return relabel(row, cells);
}

export function withRowState<R extends MatrixRow>(row: R, state: "ok" | "deleted" | "duplicate"): R {
  return { ...row, state };
}

export type RiderStatus = "DNS" | "DNF" | "DSQ" | "INT" | null;

/** A rider's total: best three landed attempts (the owner's default model) + the mean Impression score. Deleted and duplicate attempts never count. */
export function riderTotal(rows: MatrixRow[], impression: Array<number | null>, status: RiderStatus): { tricks: number; impression: number; total: number | null; label: string } {
  const scores = rows
    .filter((r) => r.state === "ok" && r.status === "landed" && r.panel !== null)
    .map((r) => r.panel as number)
    .sort((a, b) => b - a);
  const counted = (status === "INT" ? scores.slice(1) : scores).slice(0, 3);
  const tricks = roundHalfUp(counted.reduce((a, b) => a + b, 0), 2);
  const given = impression.filter((v): v is number => v !== null);
  const imp = given.length ? roundHalfUp(given.reduce((a, b) => a + b, 0) / given.length, 2) : 0;
  if (status === "DNS" || status === "DSQ") return { tricks, impression: imp, total: null, label: copy.live.result.noTotal };
  const total = roundHalfUp(tricks + imp, 2);
  return { tricks, impression: imp, total, label: two(total) };
}

/** What blocks Publish, in words: a judge's missing score on a landed attempt, and a missing Impression score. A rider who did not start blocks nothing. */
export function blockersFor(rows: ConsoleRow[], impression: Record<string, Array<number | null>>, status: Record<string, RiderStatus>, labels: Record<string, string>, impressionName: string = DEFAULT_IMPRESSION_NAME): string[] {
  const out: string[] = [];
  for (const r of rows) {
    if (r.state !== "ok" || r.status !== "landed" || status[r.riderKey] === "DNS" || status[r.riderKey] === "DSQ") continue;
    r.cells.forEach((c, i) => {
      if (c.state === "missing") out.push(copy.live.head.blockerScore(copy.live.matrix.judge(i + 1), labels[r.riderKey], r.seq));
    });
  }
  for (const [rider, values] of Object.entries(impression)) {
    if (status[rider] === "DNS" || status[rider] === "DSQ") continue;
    values.forEach((v, i) => {
      if (v === null) out.push(copy.live.head.blockerImpression(copy.live.matrix.judge(i + 1), labels[rider], impressionName));
    });
  }
  return out;
}

const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");

/** Merge is on for two or more attempts of the same rider and the same trick: a possible duplicate. */
export function canMerge(rows: ConsoleRow[]): boolean {
  return rows.length >= 2 && rows.every((r) => r.riderKey === rows[0].riderKey && norm(r.trick) === norm(rows[0].trick));
}

/** Merging keeps the first logged attempt (the earliest in the table) and removes the others (the owner's default, decision 10). */
export function mergeKeepFirst(rows: ConsoleRow[], ids: string[]): ConsoleRow[] {
  const keep = rows.find((r) => ids.includes(r.id));
  return rows.map((r) => (!keep || !ids.includes(r.id) ? r : r.id === keep.id ? withRowState(r, "ok") : withRowState(r, "deleted")));
}
