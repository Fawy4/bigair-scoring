import { Star } from "lucide-react";
import { Pill } from "./pill";
import { RiderLabel } from "@/components/rider-label";
import type { RiderSheetModel } from "@/lib/live/design-fixtures";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

/**
 * Everything about one rider, in the Details view: the counter, left and right counts, and every attempt (landed or crashed) with my score and a
 * "Counts" pill on the tricks that count. Chosen by tapping the rider's card.
 */
export function RiderDetail({ sheet }: { sheet: RiderSheetModel }) {
  const T = copy.live.sheet;
  return (
    <section data-testid="rider-detail" aria-label={T.title(sheet.name)} className="flex flex-col gap-1.5 rounded-card border border-beach-line bg-beach-surface p-2">
      <RiderLabel model={sheet.label} variant="live" bare />
      <p className="text-body font-semibold">
        {T.attempts} {sheet.counter} · {T.leftRight(sheet.left, sheet.right)}
      </p>
      <ol className="flex flex-col divide-y divide-beach-line rounded-xl border border-beach-line bg-beach-bg">
        {[...sheet.attempts].reverse().map((a) => (
          <li key={a.seq} data-counted={a.counted} className={cn("flex items-center justify-between gap-2 px-2 py-1", a.counted && "bg-beach-tint-grade3")}>
            <span className="min-w-0 truncate text-body font-medium">
              {copy.live.result.attemptLine(a.seq, a.trick)}
              <span className="ml-1.5 text-small text-beach-muted">{a.direction === "left" ? copy.live.summary.left : a.direction === "right" ? copy.live.summary.right : ""}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {a.counted ? (
                <Pill icon={Star} tone="ink">
                  {T.counts}
                </Pill>
              ) : null}
              {a.status === "crashed" ? (
                <Pill tone="crash">{copy.live.attempt.crashed}</Pill>
              ) : a.status === "pending" ? (
                <Pill tone="missing" dashed>
                  {T.pending}
                </Pill>
              ) : (
                <span className="text-body font-semibold tabular-nums">{a.myScoreLabel}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
