import { Star, X } from "lucide-react";
import { Pill } from "./pill";
import { RiderLabel } from "@/components/rider-label";
import type { RiderSheetModel } from "@/lib/live/design-fixtures";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

/**
 * A rider's sheet, opened by tapping their name: their attempts (landed or crashed) with my scores, which tricks count, the left and right counts and the
 * attempt counter. A panel over the screen that closes with one tap (the Close button, or the dimmed area behind it).
 */
export function RiderSheet({ sheet, onClose }: { sheet: RiderSheetModel; onClose: () => void }) {
  const T = copy.live.sheet;
  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end" data-testid="rider-sheet-layer">
      <button type="button" aria-label={T.close} onClick={onClose} className="absolute inset-0 bg-black/40" tabIndex={-1} />
      <section role="dialog" aria-label={T.title(sheet.name)} data-testid="rider-sheet" className="relative flex max-h-[85%] flex-col gap-2 overflow-y-auto rounded-t-[20px] border border-beach-line bg-beach-bg p-3">
        <div className="flex items-center justify-between gap-2">
          <RiderLabel model={sheet.label} variant="stripe" bare />
          <button type="button" onClick={onClose} className="inline-flex min-h-tap items-center gap-1.5 rounded-xl border border-beach-border bg-beach-bg px-3 text-body font-semibold">
            <X aria-hidden className="size-5" />
            {T.close}
          </button>
        </div>
        <p className="text-body font-semibold">
          {T.attempts} {sheet.counter} · {T.leftRight(sheet.left, sheet.right)}
        </p>
        <ol className="flex flex-col divide-y divide-beach-line rounded-card border border-beach-line">
          {[...sheet.attempts].reverse().map((a) => (
            <li key={a.seq} data-counted={a.counted} className={cn("flex items-center justify-between gap-2 px-3 py-2", a.counted && "bg-beach-surface")}>
              <span className="min-w-0">
                <span className="block truncate text-body font-semibold">
                  {copy.live.result.attemptLine(a.seq, a.trick)}
                </span>
                <span className="text-small font-medium text-beach-muted">
                  {a.direction === "left" ? copy.live.summary.left : a.direction === "right" ? copy.live.summary.right : ""}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {a.counted ? (
                  <Pill icon={Star} tone="accent">
                    {T.counts}
                  </Pill>
                ) : null}
                {a.status === "crashed" ? <Pill tone="crash">{copy.live.attempt.crashed}</Pill> : a.status === "pending" ? <Pill tone="missing" dashed>{T.pending}</Pill> : <span className="text-body font-semibold tabular-nums">{a.myScoreLabel}</span>}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
