"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { HeatSummaryCard } from "./heat-summary-card";
import { RiderTile } from "./rider-tile";
import { ScorePad } from "./score-pad";
import { formatPadValue } from "@/lib/live/score-pad";
import type { ImpressionRider } from "@/lib/live/design-fixtures";
import type { Scale } from "@/lib/schemas/scoring-model";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

/**
 * The judge's step after the heat: one Impression / Variety score per rider. The riders are the strip at the top (a tick once scored); the chosen
 * rider's compact heat summary sits above the pad; progress "2 / 3 riders"; Submit sheet (accent button) asks once, then the sheet is read-only.
 * Controlled: the parent keeps the values.
 */
export function ImpressionCard({
  riders,
  scale,
  values,
  onChange,
  submitted,
  onSubmit,
  caption,
}: {
  riders: ImpressionRider[];
  scale: Scale;
  values: Record<string, number | null>;
  onChange: (riderId: string, value: number) => void;
  submitted: boolean;
  onSubmit: () => void;
  caption?: React.ReactNode;
}) {
  const T = copy.live.impression;
  const [active, setActive] = useState(riders[0]?.id);
  const [confirming, setConfirming] = useState(false);
  const rider = riders.find((r) => r.id === active) ?? riders[0];
  const done = riders.filter((r) => values[r.id] !== null && values[r.id] !== undefined).length;
  const complete = done === riders.length;
  const button = "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border px-5 text-body font-semibold";
  return (
    <div data-testid="impression-card" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-small font-semibold">{T.heading}</h3>
        <span data-testid="impression-progress" className="shrink-0 whitespace-nowrap rounded-full border border-beach-line bg-beach-surface px-3 py-0.5 text-small font-semibold tabular-nums">
          {T.progress(done, riders.length)}
        </span>
      </div>
      <div role="group" aria-label={T.riders} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${riders.length}, minmax(0, 1fr))` }}>
        {riders.map((r) => {
          const set = values[r.id] !== null && values[r.id] !== undefined;
          return (
            <div key={r.id} className="relative">
              <RiderTile label={r.label} attempts={r.summary.attempts} max={null} counterText={set ? formatPadValue(values[r.id] as number, scale) : copy.live.pad.none} selected={r.id === rider.id} onSelect={() => { setActive(r.id); setConfirming(false); }} compact />
              {set ? <Check aria-label={T.riderDone} className="pointer-events-none absolute right-1.5 top-1.5 size-4 text-beach-live" /> : null}
            </div>
          );
        })}
      </div>
      <section data-testid="impression-rider" data-rider={rider.id} className="flex flex-col gap-2">
        <HeatSummaryCard summary={rider.summary} />
        <ScorePad scale={scale} value={values[rider.id] ?? null} onChange={(v) => onChange(rider.id, v)} label={T.heading} caption={caption} disabled={submitted} />
      </section>
      {submitted ? (
        <p data-testid="submitted-note" className="rounded-xl border border-beach-live bg-beach-surface p-3 text-body font-semibold">
          {T.submitted}
        </p>
      ) : confirming ? (
        <div role="alertdialog" aria-label={T.confirm} className="flex flex-col gap-2 rounded-card border border-beach-border bg-beach-surface p-3">
          <p className="text-body font-semibold">{T.confirm}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={cn(button, "border-beach-accent bg-beach-accent text-beach-on-accent")} onClick={() => { setConfirming(false); onSubmit(); }}>
              {T.confirmYes}
            </button>
            <button type="button" className={cn(button, "border-beach-border bg-beach-bg text-beach-ink")} onClick={() => setConfirming(false)}>
              {T.confirmNo}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <button type="button" disabled={!complete} onClick={() => setConfirming(true)} className={cn(button, complete ? "border-beach-accent bg-beach-accent text-beach-on-accent" : "border-dashed border-beach-line bg-beach-surface text-beach-muted")}>
            {T.submit}
          </button>
          {!complete ? <p className="text-small font-medium text-beach-muted">{T.submitWaiting}</p> : null}
        </div>
      )}
    </div>
  );
}
