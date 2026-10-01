"use client";

import { useMemo, useState } from "react";
import { Check, Minus, TriangleAlert } from "lucide-react";
import { Chip } from "./chip";
import { Pill } from "./pill";
import { RiderLabel } from "@/components/rider-label";
import { ladderView, publicHeats, type LadderHeat, type PublicBox, type PublicHeat, type PublicRider } from "@/lib/live/design-fixtures";
import { ATTEMPT_DISPLAYS, boxText, boxTone, DEFAULT_ATTEMPT_DISPLAY, type AttemptDisplay } from "@/lib/live/result-shading";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const P = copy.live.public;
// literal class names so Tailwind finds them: grade 0 is the yellowest (the lowest counted score in the heat), grade 4 the greenest (the highest)
const GRADE = ["bg-beach-tint-grade0", "bg-beach-tint-grade1", "bg-beach-tint-grade2", "bg-beach-tint-grade3", "bg-beach-tint-grade4"];

/** One attempt as a small score box: crash red with CRASH, not counted grey, counted graded yellow to green across the heat. Always an icon or a word too. */
function ScoreBox({ box, heat, mode }: { box: PublicBox; heat: PublicHeat; mode: AttemptDisplay }) {
  const tone = boxTone(box, heat.countedScores);
  const Icon = tone.kind === "crash" ? TriangleAlert : tone.kind === "counted" ? Check : Minus;
  return (
    <span
      data-testid="score-box"
      data-tone={tone.kind}
      data-grade={tone.kind === "counted" ? tone.grade : undefined}
      className={cn(
        "inline-flex min-h-[24px] items-center gap-0.5 rounded-md border px-1 text-small font-semibold tabular-nums",
        tone.kind === "crash" && "border-beach-crash bg-beach-tint-crash text-beach-ink",
        tone.kind === "notCounted" && "border-beach-line bg-beach-tint-grey text-beach-muted",
        tone.kind === "counted" && cn("border-beach-line text-beach-ink", GRADE[tone.grade]),
      )}
    >
      <Icon aria-hidden className="size-3 shrink-0" />
      {boxText(box, mode)}
    </span>
  );
}

function RiderRow({ rider, heat, mode }: { rider: PublicRider; heat: PublicHeat; mode: AttemptDisplay }) {
  return (
    <article data-testid="public-rider" data-place={rider.place} className="flex flex-col gap-1 rounded-card border border-beach-line bg-beach-surface p-1.5">
      <div className="flex items-center gap-2">
        <span className="w-5 shrink-0 text-center text-name font-semibold text-beach-muted" aria-label={copy.live.result.place(rider.place)}>
          {rider.place}
        </span>
        <div className="min-w-0 flex-1">
          <RiderLabel model={rider.label} variant="live" bare />
        </div>
        {rider.status === "DNS" ? <Pill tone="missing">{copy.live.result.dns}</Pill> : null}
        <span data-testid="public-total" className="shrink-0 text-name font-semibold tabular-nums">
          {rider.totalLabel}
        </span>
      </div>
      {rider.formula ? (
        <p data-testid="public-formula" className="text-small font-medium text-beach-muted">
          {rider.formula}
        </p>
      ) : null}
      {rider.boxes.length ? (
        <div className="flex flex-wrap gap-1">
          {rider.boxes.map((b) => (
            <ScoreBox key={b.seq} box={b} heat={heat} mode={mode} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function Legend() {
  return (
    <p data-testid="public-legend" className="flex flex-wrap items-center gap-1 text-small font-medium text-beach-muted">
      <span className="inline-flex items-center gap-0.5 rounded-md border border-beach-crash bg-beach-tint-crash px-1 text-beach-ink">
        <TriangleAlert aria-hidden className="size-3" />
        {copy.live.result.crash}
      </span>
      <span className="inline-flex items-center gap-0.5 rounded-md border border-beach-line bg-beach-tint-grey px-1">
        <Minus aria-hidden className="size-3" />
        {copy.live.result.notCounted}
      </span>
      <span className="inline-flex items-center gap-0.5 rounded-md border border-beach-line px-1 text-beach-ink" style={{ background: "linear-gradient(90deg, var(--beach-tint-grade0), var(--beach-tint-grade4))" }}>
        <Check aria-hidden className="size-3" />
        {P.legendCounted}
      </span>
    </p>
  );
}

function LadderCard({ heat }: { heat: LadderHeat }) {
  return (
    <article data-testid="ladder-heat" className="flex min-w-[10rem] flex-1 flex-col overflow-hidden rounded-card border border-beach-line bg-beach-surface">
      <header className="flex items-center justify-between gap-2 px-2 py-1">
        <span className="text-body font-semibold">{heat.name}</span>
        <Pill tone={heat.status === "complete" ? "live" : "missing"}>{heat.status === "complete" ? P.heatComplete : P.heatScheduled}</Pill>
      </header>
      {heat.riders.map((r, i) => (
        <div key={i} data-testid="ladder-rider" data-placeholder={r.placeholder} className="flex min-h-row items-center justify-between gap-2 px-2 text-body font-semibold" style={{ backgroundColor: r.hex, color: r.ink }}>
          <span className="min-w-0 truncate">{r.name}</span>
          <span className="shrink-0 tabular-nums">{r.totalLabel}</span>
        </div>
      ))}
    </article>
  );
}

/**
 * The public results as 5b/Phase 6 will render them (owner, round 4): tabs per heat; per heat one compact row per rider in rank order (Rider label, place, total with the
 * formula in words) and the attempts as small score boxes in attempt order; and a ladder view where every heat shows its riders in their Lycra colour with their totals.
 * What a box shows is a division setting (attempt number + score is Arrow's default); the control here only previews it.
 */
export function PublicResults() {
  const heats = useMemo(() => publicHeats(), []);
  const ladder = useMemo(() => ladderView(), []);
  const [view, setView] = useState<"results" | "ladder">("results");
  const [heatId, setHeatId] = useState("h4");
  const [mode, setMode] = useState<AttemptDisplay>(DEFAULT_ATTEMPT_DISPLAY);
  const heat = heats.find((h) => h.id === heatId)!;
  return (
    <div data-testid="public-results" className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label={P.view}>
        <Chip data-testid="view-results" pressed={view === "results"} onClick={() => setView("results")}>
          {P.results}
        </Chip>
        <Chip data-testid="view-ladder" pressed={view === "ladder"} onClick={() => setView("ladder")}>
          {P.ladder}
        </Chip>
      </div>
      {view === "results" ? (
        <>
          <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label={P.heats}>
            {heats.map((h) => (
              <Chip key={h.id} role="tab" aria-selected={h.id === heatId} data-heat-tab={h.id} pressed={h.id === heatId} onClick={() => setHeatId(h.id)}>
                {h.name}
              </Chip>
            ))}
          </div>
          <p data-testid="public-caption" className="flex flex-wrap items-center gap-1.5 text-small font-medium text-beach-muted">
            {P.tricksLogged(heat.trickCount, heat.attemptsPerRider)}
            {heat.status === "live" ? <Pill tone="live">{P.heatLive}</Pill> : null}
          </p>
          <Legend />
          {heat.riders.map((r) => (
            <RiderRow key={r.place} rider={r} heat={heat} mode={mode} />
          ))}
          <div className="flex flex-wrap items-center gap-1 rounded-card border border-dashed border-beach-line p-1" role="group" aria-label={P.setting}>
            <span className="text-small font-semibold text-beach-muted">{P.setting}</span>
            {ATTEMPT_DISPLAYS.map((m) => (
              <Chip key={m} data-mode={m} pressed={mode === m} onClick={() => setMode(m)}>
                {copy.design.result.modes[m]}
              </Chip>
            ))}
          </div>
        </>
      ) : (
        <div data-testid="ladder" className="flex flex-col gap-2">
          {ladder.rounds.map((round) => (
            <section key={round.name} aria-label={round.name} className="flex flex-col gap-1">
              <h3 className="self-start rounded-full border border-beach-line bg-beach-surface px-2 text-small font-semibold">{round.name}</h3>
              <div className="flex flex-wrap gap-1.5">
                {round.heats.map((h) => (
                  <LadderCard key={h.name} heat={h} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
