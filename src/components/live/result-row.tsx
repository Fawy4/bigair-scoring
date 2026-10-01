import { Star, TriangleAlert } from "lucide-react";
import { Pill } from "./pill";
import { RiderLabel } from "@/components/rider-label";
import type { ResultRowModel } from "@/lib/live/design-fixtures";
import { attemptLabel, attemptTone, type AttemptDisplay } from "@/lib/live/result-shading";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

// literal class names so Tailwind finds them: shade 0 is the strongest green (the highest counted trick), shade 3 the lightest
const GREEN = ["bg-beach-tint-green0", "bg-beach-tint-green1", "bg-beach-tint-green2", "bg-beach-tint-green3"];

/**
 * One rider's public result: place, Rider label, total, the sum in words, and one line per attempt, colour-coded and each with a word or an icon:
 * crash red ("CRASH"), not counted grey, counted green from the darkest (the highest counted trick) to the lightest (the lowest counted).
 * `display` is the division setting "What spectators see per attempt": trick name + score (default), attempt number + score, or scores only.
 * The percent of the maximum is NOT shown unless a division turns on "Show scores as % of maximum" (`showPercent`); the data always carries it for exports.
 */
export function ResultRow({ row, showPercent = false, display = "trick_score" }: { row: ResultRowModel; showPercent?: boolean; display?: AttemptDisplay }) {
  const T = copy.live.result;
  const tone = row.attempts.map((a) => ({ seq: a.seq, status: a.status, counted: a.counted, score: a.scoreLabel === null ? null : Number(a.scoreLabel) }));
  return (
    <article data-testid="result-row" data-display={display} className="flex flex-col gap-1.5 rounded-card border border-beach-line bg-beach-surface p-2">
      <div className="flex items-center gap-2">
        <span className="min-w-[2rem] rounded-lg border border-beach-border bg-beach-bg px-1.5 text-center text-name font-semibold tabular-nums" aria-label={T.place(row.place)}>
          {row.place}
        </span>
        <div className="min-w-0 flex-1">
          <RiderLabel model={row.label} variant="live" bare />
        </div>
        <span className="flex flex-col items-end">
          <span data-testid="result-total" className="text-name font-semibold tabular-nums">
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
        <ul className="flex flex-col gap-1">
          {row.attempts.map((a, i) => {
            const t = attemptTone(tone[i], tone);
            const words = attemptLabel(a, display);
            return (
              <li
                key={a.seq}
                data-tone={t.kind}
                data-shade={t.kind === "counted" ? t.shade : undefined}
                className={cn(
                  "flex min-h-[32px] items-center justify-between gap-2 rounded-lg border px-2 py-0.5 text-body font-medium text-beach-ink",
                  t.kind === "crash" && "border-beach-crash bg-beach-tint-crash",
                  t.kind === "notCounted" && "border-beach-line bg-beach-tint-grey",
                  t.kind === "counted" && cn("border-beach-line", GREEN[t.shade]),
                )}
              >
                <span className="min-w-0 truncate">{words.left}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {t.kind === "counted" ? (
                    <Pill icon={Star} tone="ink">
                      {T.counted}
                    </Pill>
                  ) : t.kind === "crash" ? (
                    <Pill icon={TriangleAlert} tone="crash">
                      {T.crash}
                    </Pill>
                  ) : (
                    <span className="text-small font-semibold text-beach-muted">{T.notCounted}</span>
                  )}
                  {words.right ? <span className="font-semibold tabular-nums">{words.right}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
}
