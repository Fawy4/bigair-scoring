import { Copy, EyeOff, Flag, Flame, MoreVertical, Minus, Trash2, UserX } from "lucide-react";
import { RiderLabel } from "@/components/rider-label";
import { cellTone, outlierTolerance } from "@/lib/live/cell-tone";
import { KOTA } from "@/lib/live/design-fixtures";
import { judgeWordOf, type JudgeName } from "@/lib/live/judge-names";
import type { CellState, MatrixCell, MatrixModel, MatrixRow, PendingMatrixRow } from "@/lib/live/matrix-model";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const T = copy.live.matrix;
// a judge's score by its distance from the panel score: within tolerance green, then yellow, orange, red (literal class names for Tailwind)
const DIST = ["bg-beach-tint-dist0", "bg-beach-tint-dist1", "bg-beach-tint-dist2", "bg-beach-tint-dist3"];
const DEFAULT_TOLERANCE = outlierTolerance(KOTA);

type Row = MatrixRow & { riderKey?: string; openFlags?: Array<{ id: string; kind: string }> };

export interface MatrixActions {
  /** Tap a score: edit it (with a reason). */
  onCell?: (row: Row, judgeId: string) => void;
  /** Tap the attempt: its menu (Delete, Merge duplicate, Edit, Add attempt). */
  onAttempt?: (row: Row) => void;
  /** Tap the rider: their menu (DNS, DNF, DSQ, Interference). */
  onRider?: (row: Row) => void;
  /** Tick boxes left of the attempt number: select several attempts (Merge duplicates, Delete). */
  selected?: string[];
  onSelect?: (row: Row) => void;
}

/** One cell: the score, or a word with an icon. Never colour alone, and struck through where the score does not count. */
function Cell({ cell, panel, onTap, label, tolerance }: { cell: MatrixCell; panel: number | null; onTap?: () => void; label: string; tolerance: number }) {
  const view: Record<CellState, { word: string | null; Icon: typeof Minus | null; cls: string }> = {
    scored: { word: null, Icon: null, cls: "border-beach-line text-beach-ink" },
    missing: { word: T.missing, Icon: Minus, cls: "border-dashed border-beach-missing bg-beach-surface text-beach-missing" },
    missed: { word: T.missed, Icon: EyeOff, cls: "border-beach-missing bg-beach-surface italic text-beach-missing" },
    absent: { word: T.absent, Icon: UserX, cls: "border-beach-missing bg-beach-surface text-beach-missing" },
    outlier: { word: null, Icon: null, cls: "border-beach-line text-beach-ink" },
    crash: { word: T.crash, Icon: Flame, cls: "border-beach-crash bg-beach-tint-crash text-beach-ink" },
    deleted: { word: T.deleted, Icon: Trash2, cls: "border-beach-missing bg-beach-surface text-beach-missing" },
    duplicate: { word: T.duplicate, Icon: Copy, cls: "border-beach-outlier bg-beach-bg text-beach-outlier" },
  };
  const v = view[cell.state];
  const tone = (cell.state === "scored" || cell.state === "outlier") && cell.value !== null && panel !== null ? cellTone(cell.value, panel, tolerance) : null;
  const editable = onTap && cell.state !== "crash" && cell.state !== "deleted";
  const cls = cn("flex min-h-row min-w-[4rem] flex-col items-center justify-center rounded-lg border px-1 py-0 text-body font-semibold leading-tight tabular-nums", v.cls, tone ? DIST[tone.band] : "bg-beach-bg");
  const body = (
    <>
      {cell.state === "scored" || cell.state === "outlier" || cell.state === "deleted" ? <span className={cn(cell.state === "deleted" && "line-through")}>{cell.label}</span> : null}
      {tone?.delta ? <span data-testid="cell-delta" className="text-small font-semibold">{tone.delta}</span> : null}
      {v.word ? (
        <span className="inline-flex items-center gap-1 text-small font-semibold">
          {v.Icon ? <v.Icon aria-hidden className="size-3.5" /> : null}
          {v.word}
        </span>
      ) : null}
    </>
  );
  return editable ? (
    <button type="button" data-testid="matrix-cell" data-state={cell.state} data-band={tone?.band} aria-label={label} onClick={onTap} className={cn(cls, "w-full")}>
      {body}
    </button>
  ) : (
    <div data-testid="matrix-cell" data-state={cell.state} data-band={tone?.band} className={cls}>
      {body}
    </div>
  );
}

function Row({ row, actions, tolerance, judges }: { row: Row; actions: MatrixActions; tolerance: number; judges?: JudgeName[] }) {
  const judgeWord = (i: number) => (judges?.[i] ? judgeWordOf(judges[i]) : T.judge(i + 1));
  const struck = row.state === "deleted";
  return (
    <tr data-testid="matrix-row" data-row-id={row.id} data-row-state={row.state} className="border-t border-beach-line align-middle">
      <td className="px-1 py-0.5">
        {actions.onSelect && row.state !== "deleted" ? (
          <label className="flex min-h-tap min-w-tap cursor-pointer items-center justify-center">
            <input type="checkbox" data-testid="row-select" aria-label={`${copy.live.console.select} ${T.attempt} ${row.seq} (${row.label.primary.text})`} checked={actions.selected?.includes(row.id) ?? false} onChange={() => actions.onSelect!(row)} className="size-5 accent-[var(--beach-accent)]" />
          </label>
        ) : null}
      </td>
      <th scope="row" className="px-1 py-0.5 text-left">
        {actions.onAttempt && row.state !== "deleted" ? (
          <button type="button" data-testid="attempt-menu-button" aria-label={`${T.attempt} ${row.seq}: ${copy.live.console.attemptMenu}`} onClick={() => actions.onAttempt!(row)} className="inline-flex min-h-tap min-w-tap items-center justify-center gap-0.5 rounded-lg border border-beach-border bg-beach-bg text-body font-semibold tabular-nums">
            {row.seq}
            <MoreVertical aria-hidden className="size-4" />
          </button>
        ) : (
          <span className="text-body font-semibold tabular-nums">{row.seq}</span>
        )}
      </th>
      <td className="px-1.5 py-1">
        {actions.onRider ? (
          <button type="button" data-testid="rider-menu-button" aria-label={`${row.label.primary.text}: ${copy.live.console.riderMenu}`} onClick={() => actions.onRider!(row)} className="min-h-row rounded-lg text-left">
            <RiderLabel model={{ ...row.label, secondary: row.label.secondary.filter((x) => x.key === "name") }} variant="live" bare />
          </button>
        ) : (
          <RiderLabel model={{ ...row.label, secondary: row.label.secondary.filter((x) => x.key === "name") }} variant="live" bare />
        )}
      </td>
      <td className={cn("min-w-[6rem] px-1.5 py-1 text-body font-medium", (struck || row.status === "crashed") && "line-through")}>
        {row.trick}
        {row.openFlags?.length ? (
          <span data-testid="row-flag" className="mt-0.5 flex items-center gap-1 text-small font-semibold text-beach-outlier">
            <Flag aria-hidden className="size-3.5" />
            {row.openFlags.map((f) => copy.headLive.flagKinds[f.kind] ?? f.kind).join(", ")}
          </span>
        ) : null}
        {row.state === "duplicate" ? (
          <span className="mt-0.5 flex items-center gap-1 text-small font-semibold text-beach-outlier">
            <Copy aria-hidden className="size-3.5" />
            {T.duplicate}
          </span>
        ) : null}
      </td>
      {row.cells.map((c, i) => (
        <td key={c.judgeId} className="px-1 py-1">
          <Cell tolerance={tolerance} cell={c} panel={row.panel} label={`${judgeWord(i)}, ${T.attempt} ${row.seq}: ${c.label}`} onTap={actions.onCell ? () => actions.onCell!(row, c.judgeId) : undefined} />
        </td>
      ))}
      <td className="px-1.5 py-1 text-right">
        <span data-testid="matrix-panel" data-panel-state={row.panelState} className={cn("inline-flex min-w-[4rem] flex-col items-end text-name font-semibold tabular-nums", row.panelState === "outlier" && "text-beach-outlier", row.state === "deleted" && "line-through")}>
          {row.panelLabel}
          {row.panelState === "incomplete" ? <span className="text-small font-semibold text-beach-missing">{T.incomplete}</span> : null}
          {row.panelState === "outlier" ? <span className="text-small font-semibold">{T.outlier}</span> : null}
        </span>
      </td>
    </tr>
  );
}

/** The table's rows with the pending rows placed: all at the end, or (rows grouped by rider) straight after the last row of their rider. */
export function withPending(rows: Row[], pending: PendingMatrixRow[], afterRider: boolean): Array<{ row: Row; pending?: undefined } | { pending: PendingMatrixRow; row?: undefined }> {
  const out: Array<{ row: Row; pending?: undefined } | { pending: PendingMatrixRow; row?: undefined }> = [];
  if (!afterRider) {
    for (const row of rows) out.push({ row });
    for (const p of pending) out.push({ pending: p });
    return out;
  }
  const placed = new Set<string>();
  rows.forEach((row, i) => {
    out.push({ row });
    const next = rows[i + 1];
    if (!next || next.riderKey !== row.riderKey) {
      placed.add(row.riderKey ?? "");
      for (const p of pending) if (p.riderKey === row.riderKey) out.push({ pending: p });
    }
  });
  for (const p of pending) if (!placed.has(p.riderKey)) out.push({ pending: p });
  return out;
}

/**
 * A pending row: scores judges typed on the Rider sheet before the spotter logged the attempt. Greyed and hatched, no trick, "pending · J1, J3", each judge's note
 * in that judge's column. It has no panel score: it is never counted, never published, never shown to the public.
 */
function PendingRowView({ row, judges, onClear }: { row: PendingMatrixRow; judges?: JudgeName[]; /** The head judge's Clear on one judge's note. */ onClear?: (row: PendingMatrixRow, judgeId: string, noteId: string) => void }) {
  const tags = row.judgeIds.map((id) => judges?.find((j) => j.id === id)?.tag ?? T.aJudge).join(", ");
  return (
    <tr data-testid="pending-row" data-row-state="pending" data-entry={row.riderKey} data-line={row.n} aria-label={T.pendingRow(row.n)} className="border-t border-beach-line align-middle text-beach-muted" style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent 0 6px, var(--beach-line) 6px 7px)" }}>
      <td className="px-1 py-0.5" />
      <th scope="row" className="px-1 py-0.5 text-left">
        <span className="text-body font-semibold tabular-nums">{row.n}</span>
      </th>
      <td className="px-1.5 py-1">
        <RiderLabel model={{ ...row.label, secondary: row.label.secondary.filter((x) => x.key === "name") }} variant="live" bare />
      </td>
      <td className="min-w-[6rem] px-1.5 py-1 text-small font-semibold" data-testid="pending-tag">
        {T.pendingTag(tags)}
      </td>
      {row.cells.map((c) => (
        <td key={c.judgeId} className="px-1 py-1">
          <div data-testid="pending-cell" data-judge={c.judgeId} data-has-note={c.value !== null} className={cn("flex min-h-row min-w-[4rem] items-center justify-center rounded-lg border border-dashed px-1 text-body font-semibold tabular-nums", c.value !== null ? "border-beach-muted bg-beach-surface text-beach-ink" : "border-beach-line")}>
            {c.label}
            {onClear && c.noteId ? (
              <button type="button" data-testid="clear-note" data-judge={c.judgeId} aria-label={T.clearNoteAria(judges?.find((j) => j.id === c.judgeId)?.tag ?? T.aJudge, row.label.primary.text, row.n)} onClick={() => onClear(row, c.judgeId, c.noteId!)} className="ml-1 min-h-tap rounded-lg border border-beach-border bg-beach-bg px-1.5 text-small font-semibold text-beach-ink">
                {T.clearNote}
              </button>
            ) : null}
          </div>
        </td>
      ))}
      <td className="px-1.5 py-1 text-right text-name font-semibold">—</td>
    </tr>
  );
}

/**
 * The head judge's score table: attempts down, judges across, the panel score last. For a tablet or laptop. With `actions` it is a working tool:
 * tap a score to edit it, tap the attempt number for its menu, tap the rider for theirs.
 */
export function HeadMatrix({ model, actions = {}, tolerance = DEFAULT_TOLERANCE, judges, pending = [], pendingAfterRider = false, onClearNote }: { model: MatrixModel & { rows: Row[] }; actions?: MatrixActions; tolerance?: number; /** Pending rows (Rider sheet notes with no attempt): after the attempts, or (grouped by rider) after each rider's own. */ pending?: PendingMatrixRow[]; pendingAfterRider?: boolean; /** The head judge's Clear on a pending note (only while the heat can still be changed). */ onClearNote?: (row: PendingMatrixRow, judgeId: string, noteId: string) => void; /** The judges as the seat names they were given ("Fawy", with "J1" under it). Without it the columns read "Judge 1" (the design preview). */ judges?: JudgeName[] }) {
  return (
    <div data-testid="matrix-scroll" className="overflow-x-auto rounded-card border border-beach-line bg-beach-bg">
      <table data-testid="head-matrix" className="min-w-[34rem] border-collapse text-beach-ink">
        <thead>
          <tr className="text-left text-small font-semibold text-beach-muted">
            <th scope="col" className="px-1 py-1">
              <span className="sr-only">{copy.live.console.select}</span>
            </th>
            <th scope="col" className="px-1.5 py-1">
              {T.attempt}
            </th>
            <th scope="col" className="px-1.5 py-1">
              {T.rider}
            </th>
            <th scope="col" className="px-1.5 py-1">
              {T.trick}
            </th>
            {model.judgeIds.map((j, i) => (
              <th key={j} scope="col" data-testid="judge-column" className="min-w-[5rem] max-w-[9rem] px-1 py-1 text-center">
                {judges?.[i] ? (
                  <>
                    <span data-testid="judge-column-name" className="block whitespace-normal break-words text-body font-semibold text-beach-ink">
                      {judgeWordOf(judges[i])}
                    </span>
                    {judges[i].name ? (
                      <span data-testid="judge-column-tag" className="block text-small font-medium text-beach-muted">
                        {judges[i].tag}
                      </span>
                    ) : null}
                  </>
                ) : (
                  T.judge(i + 1)
                )}
              </th>
            ))}
            <th scope="col" className="px-1.5 py-1 text-right">
              {T.panel}
            </th>
          </tr>
        </thead>
        <tbody>
          {withPending(model.rows, pending, pendingAfterRider).map((x) => (x.pending ? <PendingRowView key={x.pending.id} row={x.pending} judges={judges} onClear={onClearNote} /> : <Row key={x.row.id} row={x.row} actions={actions} tolerance={tolerance} judges={judges} />))}
        </tbody>
      </table>
    </div>
  );
}
