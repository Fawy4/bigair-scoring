import { EyeOff, Flame, Minus, TriangleAlert, Trash2, Copy, UserX } from "lucide-react";
import { RiderLabel } from "@/components/rider-label";
import type { CellState, MatrixCell, MatrixModel, MatrixRow } from "@/lib/live/matrix-model";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const T = copy.live.matrix;

/** One cell: the score, or a word with an icon. Never colour alone, and struck through where the score does not count. */
function Cell({ cell }: { cell: MatrixCell }) {
  const view: Record<CellState, { word: string | null; Icon: typeof Minus | null; cls: string }> = {
    scored: { word: null, Icon: null, cls: "border-beach-border bg-beach-bg text-beach-ink" },
    missing: { word: T.missing, Icon: Minus, cls: "border-dashed border-beach-missing bg-beach-surface text-beach-missing" },
    missed: { word: T.missed, Icon: EyeOff, cls: "border-beach-missing bg-beach-surface italic text-beach-missing" },
    absent: { word: T.absent, Icon: UserX, cls: "border-beach-missing bg-beach-surface text-beach-missing" },
    outlier: { word: T.outlier, Icon: TriangleAlert, cls: "border-4 border-beach-outlier bg-beach-bg text-beach-outlier" },
    crash: { word: T.crash, Icon: Flame, cls: "border-beach-crash bg-beach-bg text-beach-crash" },
    deleted: { word: T.deleted, Icon: Trash2, cls: "border-beach-missing bg-beach-surface text-beach-missing" },
    duplicate: { word: T.duplicate, Icon: Copy, cls: "border-beach-outlier bg-beach-bg text-beach-outlier" },
  };
  const v = view[cell.state];
  return (
    <div data-testid="matrix-cell" data-state={cell.state} className={cn("flex min-h-[3.5rem] min-w-[5.5rem] flex-col items-center justify-center rounded-md border-2 px-2 py-1 text-lg font-extrabold tabular-nums", v.cls)}>
      {cell.state === "scored" || cell.state === "outlier" || cell.state === "deleted" ? <span className={cn(cell.state === "deleted" && "line-through")}>{cell.label}</span> : null}
      {v.word ? (
        <span className="inline-flex items-center gap-1 text-base font-bold">
          {v.Icon ? <v.Icon aria-hidden className="size-4" /> : null}
          {v.word}
        </span>
      ) : null}
    </div>
  );
}

function Row({ row }: { row: MatrixRow }) {
  const struck = row.state === "deleted";
  return (
    <tr data-testid="matrix-row" data-row-state={row.state} className="border-t-2 border-beach-border align-middle">
      <th scope="row" className="px-2 py-2 text-left text-xl font-extrabold tabular-nums">
        {row.seq}
      </th>
      <td className="px-2 py-2">
        <RiderLabel model={row.label} size="sm" nameplate />
      </td>
      <td className={cn("min-w-[9rem] px-2 py-2 text-lg font-bold", (struck || row.status === "crashed") && "line-through")}>
        {row.trick}
        {row.state === "duplicate" ? (
          <span className="mt-1 flex items-center gap-1 text-base font-extrabold text-beach-outlier">
            <Copy aria-hidden className="size-4" />
            {T.duplicate}
          </span>
        ) : null}
      </td>
      {row.cells.map((c) => (
        <td key={c.judgeId} className="px-1 py-2">
          <Cell cell={c} />
        </td>
      ))}
      <td className="px-2 py-2 text-right">
        <span data-testid="matrix-panel" data-panel-state={row.panelState} className={cn("inline-flex min-w-[5rem] flex-col items-end text-2xl font-extrabold tabular-nums", row.panelState === "outlier" && "text-beach-outlier", row.state === "deleted" && "line-through")}>
          {row.panelLabel}
          {row.panelState === "incomplete" ? <span className="text-base font-bold text-beach-missing">{T.incomplete}</span> : null}
          {row.panelState === "outlier" ? <span className="text-base font-bold">{T.outlier}</span> : null}
        </span>
      </td>
    </tr>
  );
}

/**
 * The head judge's score table: attempts down, judges across, the panel score last. For a tablet or laptop; the page that holds it
 * scrolls the table inside its own box, never the whole page sideways (docs/06 §00.2).
 */
export function HeadMatrix({ model }: { model: MatrixModel }) {
  return (
    <div data-testid="matrix-scroll" className="overflow-x-auto rounded-lg border-2 border-beach-border bg-beach-bg">
      <table data-testid="head-matrix" className="min-w-[44rem] border-collapse text-beach-ink">
        <thead>
          <tr className="text-left text-lg font-extrabold">
            <th scope="col" className="px-2 py-2">
              {T.attempt}
            </th>
            <th scope="col" className="px-2 py-2">
              {T.rider}
            </th>
            <th scope="col" className="px-2 py-2">
              {T.trick}
            </th>
            {model.judgeIds.map((j, i) => (
              <th key={j} scope="col" className="px-1 py-2 text-center">
                {T.judge(i + 1)}
              </th>
            ))}
            <th scope="col" className="px-2 py-2 text-right">
              {T.panel}
            </th>
          </tr>
        </thead>
        <tbody>
          {model.rows.map((r) => (
            <Row key={r.id} row={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
