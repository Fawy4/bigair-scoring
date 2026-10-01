import { Star, TriangleAlert } from "lucide-react";
import { Pill } from "./pill";
import { RiderLabel } from "@/components/rider-label";
import type { ResultRowModel } from "@/lib/live/design-fixtures";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

/**
 * One rider's result: place, Rider label, total, the sum in words, and which tricks counted (accent border, with the word "Counted"). A crash says CRASH.
 * The percent of the maximum is NOT shown unless a division turns on "Show scores as % of maximum" (`showPercent`); the data always carries it for exports.
 */
export function ResultRow({ row, showPercent = false }: { row: ResultRowModel; showPercent?: boolean }) {
  const T = copy.live.result;
  return (
    <article data-testid="result-row" className="flex flex-col gap-2 rounded-card border border-beach-line bg-beach-surface p-3">
      <div className="flex items-center gap-3">
        <span className="min-w-[2.5rem] rounded-xl border border-beach-border bg-beach-bg px-2 py-0.5 text-center text-digit font-semibold tabular-nums" aria-label={T.place(row.place)}>
          {row.place}
        </span>
        <div className="min-w-0 flex-1">
          <RiderLabel model={row.label} variant="stripe" bare />
        </div>
        <span className="flex flex-col items-end">
          <span data-testid="result-total" className="text-digit font-semibold tabular-nums">
            {row.totalLabel}
          </span>
          {row.status === "DNS" ? <Pill tone="missing">{T.dns}</Pill> : null}
        </span>
      </div>
      {row.formula ? (
        <p data-testid="result-formula" className="text-body font-medium">
          {row.formula}
        </p>
      ) : null}
      {showPercent && row.percentLabel ? (
        <p data-testid="result-percent" className="text-body font-medium text-beach-muted">
          {row.percentLabel}
        </p>
      ) : null}
      {row.attempts.length ? (
        <ul className="flex flex-col gap-1.5">
          {row.attempts.map((a) => {
            const crash = a.status === "crashed";
            return (
              <li
                key={a.seq}
                data-counted={a.counted}
                className={cn("flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-body font-medium", a.counted ? "border-2 border-beach-accent bg-beach-bg" : "border border-beach-line bg-beach-bg")}
              >
                <span className={cn("min-w-0 truncate", crash && "text-beach-muted")}>{T.attemptLine(a.seq, a.trick)}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {a.counted ? (
                    <Pill icon={Star} tone="accent">
                      {T.counted}
                    </Pill>
                  ) : crash ? (
                    <Pill icon={TriangleAlert} tone="crash">
                      {T.crash}
                    </Pill>
                  ) : (
                    <span className="text-small text-beach-muted">{T.notCounted}</span>
                  )}
                  {a.scoreLabel ? <span className="font-semibold tabular-nums">{a.scoreLabel}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
}
