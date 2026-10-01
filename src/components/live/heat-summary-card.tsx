import type { HeatSummary } from "@/lib/live/design-fixtures";
import { copy } from "@/lib/ui-copy";

/**
 * The rider's heat in one compact card, above the Impression / Variety pad: attempts / landed / crashed, left and right, repeats ×n, and the landed tricks
 * with their direction and the judge's own score. Nothing about rotations or families.
 */
export function HeatSummaryCard({ summary }: { summary: HeatSummary }) {
  const T = copy.live.summary;
  return (
    <section data-testid="heat-summary" aria-label={T.heading} className="flex flex-col gap-1.5 rounded-card border border-beach-line bg-beach-surface p-2.5">
      <p data-testid="summary-counts" className="text-body font-semibold">
        {T.counts(summary.attempts, summary.landed, summary.crashed)}
      </p>
      <p className="text-body font-medium text-beach-muted">
        {T.leftRight(summary.left, summary.right)} · {T.repeats(summary.repeats)}
      </p>
      <ol className="mt-1 flex flex-col divide-y divide-beach-line" aria-label={T.landedList}>
        {summary.landedList.map((t) => (
          <li key={t.seq} className="flex items-baseline justify-between gap-3 py-0.5">
            <span className="min-w-0 truncate text-body font-medium">
              {copy.live.result.attemptLine(t.seq, t.trick)}
              {t.direction ? <span className="ml-2 text-small text-beach-muted">{t.direction === "left" ? T.left : T.right}</span> : null}
            </span>
            <span className="shrink-0 text-body font-semibold tabular-nums">{t.scoreLabel}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
