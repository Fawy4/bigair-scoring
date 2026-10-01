import { Star, TriangleAlert } from "lucide-react";
import { RiderLabel } from "@/components/rider-label";
import type { ResultRowModel } from "@/lib/live/design-fixtures";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

/** One rider's result: place, Rider label, total and %, the sum in words, and which tricks counted (highlighted, with the word "Counted"). A crash says CRASH. */
export function ResultRow({ row }: { row: ResultRowModel }) {
  const T = copy.live.result;
  return (
    <article data-testid="result-row" className="flex flex-col gap-3 rounded-lg border-2 border-beach-border bg-beach-surface p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-[3.5rem] rounded-lg border-4 border-beach-border bg-beach-bg px-3 py-1 text-center text-4xl font-extrabold tabular-nums" aria-label={T.place(row.place)}>
          {row.place}
        </span>
        <RiderLabel model={row.label} size="md" nameplate />
        <span className="ml-auto flex flex-col items-end">
          <span data-testid="result-total" className="text-4xl font-extrabold tabular-nums">
            {row.totalLabel}
          </span>
          {row.status === "DNS" ? <span className="rounded-full border-2 border-beach-missing px-3 text-lg font-extrabold text-beach-missing">{T.dns}</span> : null}
          {row.percentLabel ? <span className="text-xl font-bold text-beach-muted">{row.percentLabel}</span> : null}
        </span>
      </div>
      {row.formula ? (
        <p data-testid="result-formula" className="text-xl font-bold">
          {row.formula}
        </p>
      ) : null}
      {row.attempts.length ? (
        <ul className="flex flex-col gap-2">
          {row.attempts.map((a) => {
            const crash = a.status === "crashed";
            return (
              <li
                key={a.seq}
                data-counted={a.counted}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xl font-bold",
                  a.counted ? "border-4 border-beach-selected bg-beach-bg" : crash ? "border-2 border-beach-crash bg-beach-bg text-beach-crash" : "border-2 border-beach-border bg-beach-bg",
                )}
              >
                <span>{T.attemptLine(a.seq, a.trick)}</span>
                <span className="inline-flex items-center gap-2">
                  {a.counted ? (
                    <span className="inline-flex items-center gap-1 text-beach-selected">
                      <Star aria-hidden className="size-5" />
                      {T.counted}
                    </span>
                  ) : crash ? (
                    <span className="inline-flex items-center gap-1 font-extrabold">
                      <TriangleAlert aria-hidden className="size-5" />
                      {T.crash}
                    </span>
                  ) : (
                    <span className="text-beach-muted">{T.notCounted}</span>
                  )}
                  {a.scoreLabel ? <span className="tabular-nums">{a.scoreLabel}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
}
