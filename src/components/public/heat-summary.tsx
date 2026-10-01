import Link from "next/link";
import { Check, Minus, TriangleAlert } from "lucide-react";
import { RiderLabel } from "@/components/rider-label";
import { boxText, boxTone, type AttemptDisplay } from "@/lib/live/result-shading";
import type { BoxVM, HeatVM, RiderRowVM } from "@/lib/public/results-model";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const R = copy.pub.results;
// literal class names so Tailwind finds them: grade 0 is the yellowest (the lowest counted score in the heat), grade 4 the greenest (the highest)
const GRADE = ["bg-beach-tint-grade0", "bg-beach-tint-grade1", "bg-beach-tint-grade2", "bg-beach-tint-grade3", "bg-beach-tint-grade4"];

/** One attempt as a small box: crash red with CRASH, not counted grey, counted graded yellow to green across the heat. Always an icon or a word too. */
export function ScoreBox({ box, counted, mode, big = false }: { box: BoxVM; counted: number[]; mode: AttemptDisplay; big?: boolean }) {
  const tone = boxTone(box, counted);
  const Icon = tone.kind === "crash" ? TriangleAlert : tone.kind === "counted" ? Check : Minus;
  const text = box.status === "landed" && box.scoreLabel === null ? `${mode === "scores_only" ? "" : `${box.seq} · `}…` : boxText(box, mode);
  return (
    <span
      data-testid="score-box"
      data-tone={tone.kind}
      data-grade={tone.kind === "counted" ? tone.grade : undefined}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border px-1 font-semibold tabular-nums",
        big ? "min-h-[40px] gap-1 px-2 text-2xl" : "min-h-[24px] text-small",
        tone.kind === "crash" && "border-beach-crash bg-beach-tint-crash text-beach-ink",
        tone.kind === "notCounted" && "border-beach-line bg-beach-tint-grey text-beach-muted",
        tone.kind === "counted" && cn("border-beach-line text-beach-ink", GRADE[tone.grade]),
      )}
    >
      <Icon aria-hidden className={big ? "size-5 shrink-0" : "size-3 shrink-0"} />
      {text}
    </span>
  );
}

export function RiderRow({ rider, heat, href }: { rider: RiderRowVM; heat: Pick<HeatVM, "countedScores" | "mode">; href?: string | null }) {
  return (
    <article data-testid="public-rider" data-place={rider.place ?? undefined} className="flex flex-col gap-1 rounded-card border border-beach-line bg-beach-surface p-1.5">
      <div className="flex items-center gap-2">
        {rider.place !== null ? (
          <span className="w-5 shrink-0 text-center text-name font-semibold text-beach-muted" aria-label={R.place(rider.place)}>
            {rider.place}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          {rider.label ? href ? <Link prefetch={false} href={href} data-testid="rider-link" className="block"><RiderLabel model={rider.label} variant="live" bare /></Link> : <RiderLabel model={rider.label} variant="live" bare /> : <span className="text-name font-semibold text-beach-muted">{rider.placeholder}</span>}
        </div>
        {rider.state !== "ok" ? <span className="shrink-0 rounded-md border border-beach-line px-1 text-small font-semibold">{R.notRiding[rider.state]}</span> : null}
        {rider.totalLabel ? (
          <span data-testid="public-total" className="shrink-0 text-name font-semibold tabular-nums">
            {rider.totalLabel}
          </span>
        ) : null}
      </div>
      {rider.formula ? (
        <p data-testid="public-formula" className="text-small font-medium text-beach-muted">
          {rider.formula}
          {rider.percentLabel ? ` · ${rider.percentLabel}` : ""}
        </p>
      ) : null}
      {rider.boxes.length ? (
        <div className="flex flex-wrap gap-1">
          {rider.boxes.map((b) => (
            <ScoreBox key={b.seq} box={b} counted={heat.countedScores} mode={heat.mode} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function Legend() {
  return (
    <p data-testid="public-legend" className="flex flex-wrap items-center gap-1 text-small font-medium text-beach-muted">
      <span className="inline-flex items-center gap-0.5 rounded-md border border-beach-crash bg-beach-tint-crash px-1 text-beach-ink">
        <TriangleAlert aria-hidden className="size-3" />
        {copy.live.result.crash}
      </span>
      <span className="inline-flex items-center gap-0.5 rounded-md border border-beach-line bg-beach-tint-grey px-1">
        <Minus aria-hidden className="size-3" />
        {R.legendNotCounted}
      </span>
      <span className="inline-flex items-center gap-0.5 rounded-md border border-beach-line px-1 text-beach-ink" style={{ background: "linear-gradient(90deg, var(--beach-tint-grade0), var(--beach-tint-grade4))" }}>
        <Check aria-hidden className="size-3" />
        {R.legendCounted}
      </span>
    </p>
  );
}

/** A heat as the public reads it: the state line, then one compact row per rider. A held heat says so and shows no result. */
export function HeatSummary({ heat, riders, riderHref }: { heat: HeatVM; riders?: RiderRowVM[]; riderHref?: (entryId: string) => string }) {
  const rows = riders ?? heat.riders;
  const counted = riders ? rows.flatMap((r) => r.boxes.filter((b) => b.counted && b.score !== null).map((b) => b.score as number)) : heat.countedScores;
  const tricks = rows.reduce((n, r) => n + r.boxes.length, 0);
  return (
    <section data-testid="heat-summary" data-state={heat.state} aria-label={heat.title} className="flex flex-col gap-1.5">
      <p data-testid="public-caption" className="text-small font-medium text-beach-muted">
        {heat.state === "complete" ? R.attemptsLogged(tricks, heat.attemptsPerRider) : null}
        {heat.state === "live" && tricks > 0 ? copy.pub.live.tricksLogged(tricks, heat.attemptsPerRider) : null}
        {heat.state === "held" ? R.held : null}
        {heat.state === "scheduled" ? R.notStarted : null}
      </p>
      {heat.state === "complete" || (heat.state === "live" && tricks > 0) ? <Legend /> : null}
      {rows.map((r, i) => (
        <RiderRow key={r.entryId ?? `seat-${i}`} rider={r} heat={{ countedScores: counted, mode: heat.mode }} href={r.entryId && riderHref ? riderHref(r.entryId) : null} />
      ))}
    </section>
  );
}
