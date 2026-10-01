import type { HeatSummary } from "@/lib/live/design-fixtures";
import { copy } from "@/lib/ui-copy";

/** The rider's heat in one card, shown above the Impression / Variety pad so the judge remembers what they saw (docs/06 §4, "Heat end"). */
export function HeatSummaryCard({ summary }: { summary: HeatSummary }) {
  const T = copy.live.summary;
  const stat = (name: string, value: string | number) => (
    <div className="flex flex-col rounded-lg border-2 border-beach-border bg-beach-bg p-2">
      <dt className="text-base font-bold text-beach-muted">{name}</dt>
      <dd className="text-3xl font-extrabold tabular-nums">{value}</dd>
    </div>
  );
  return (
    <section data-testid="heat-summary" aria-label={T.heading} className="flex flex-col gap-3 rounded-lg border-2 border-beach-border bg-beach-surface p-3">
      <h4 className="text-xl font-extrabold">{T.heading}</h4>
      <dl className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3">
        {stat(T.attempts, summary.attempts)}
        {stat(T.landed, summary.landed)}
        {stat(T.crashed, summary.crashed)}
        {stat(T.different, summary.different)}
        {stat(T.repeats, summary.repeats)}
        {stat(`${T.left} / ${T.right}`, `${summary.left} / ${summary.right}`)}
      </dl>
      <p className="text-lg font-bold">
        <span className="text-beach-muted">{T.families}: </span>
        {summary.families.length ? summary.families.join(", ") : T.none}
      </p>
      <div>
        <p className="mb-1 text-lg font-bold text-beach-muted">{T.landedList}</p>
        <ol className="flex flex-col gap-1">
          {summary.landedList.map((t) => (
            <li key={t.seq} className="flex items-baseline justify-between gap-3 rounded-md border-2 border-beach-border bg-beach-bg px-3 py-2 text-xl font-bold">
              <span>{copy.live.result.attemptLine(t.seq, t.trick)}</span>
              <span className="tabular-nums">{t.scoreLabel}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
