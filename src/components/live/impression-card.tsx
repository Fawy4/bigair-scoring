"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Chip } from "./chip";
import { HeatSummaryCard } from "./heat-summary-card";
import { RiderTile } from "./rider-tile";
import { ScorePad } from "./score-pad";
import { nextUnscored } from "@/lib/live/impression-step";
import { formatPadValue } from "@/lib/live/score-pad";
import type { ImpressionRider } from "@/lib/live/design-fixtures";
import type { DivisionLive } from "@/lib/schemas/division-live";
import type { Scale } from "@/lib/schemas/scoring-model";
import { copy } from "@/lib/ui-copy";

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
  summaryParts,
  error,
  scoreLabel,
}: {
  riders: ImpressionRider[];
  scale: Scale;
  values: Record<string, number | null>;
  onChange: (riderId: string, value: number) => void;
  submitted: boolean;
  onSubmit: () => void;
  caption?: React.ReactNode;
  summaryParts?: DivisionLive["impressionSummary"];
  /** The server's answer to Submit, in words (for example a rider still missing). */
  error?: string | null;
  /** The model's own name for this score ("Variety"). Defaults to the house words. */
  scoreLabel?: string;
}) {
  const T = copy.live.impression;
  const [active, setActive] = useState(riders[0]?.id);
  const [confirming, setConfirming] = useState(false);
  const rider = riders.find((r) => r.id === active) ?? riders[0];
  const done = riders.filter((r) => values[r.id] !== null && values[r.id] !== undefined).length;
  const complete = done === riders.length;
  return (
    <div data-testid="impression-card" className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-heading font-semibold">{scoreLabel ?? T.heading}</h3>
        <span data-testid="impression-progress" className="shrink-0 whitespace-nowrap rounded-full border border-beach-line bg-beach-surface px-2 py-0 text-small font-semibold tabular-nums">
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
      <section data-testid="impression-rider" data-rider={rider.id} className="flex flex-col gap-1.5">
        <HeatSummaryCard summary={rider.summary} parts={summaryParts} />
        <ScorePad
          scale={scale}
          value={values[rider.id] ?? null}
          onChange={(v) => {
            onChange(rider.id, v);
            // after a score is saved, move on to the next rider who has none; with everybody scored Submit is what is left
            const next = nextUnscored(riders.map((r) => r.id), values, rider.id, rider.id);
            if (next) setActive(next);
          }}
          label={T.heading}
          caption={caption}
          disabled={submitted}
        />
      </section>
      {error ? (
        <p role="alert" data-testid="submit-error" className="rounded-lg border border-beach-failed bg-beach-surface px-2 py-1 text-body font-semibold">
          {error}
        </p>
      ) : null}
      {submitted ? (
        <p data-testid="submitted-note" className="rounded-lg border border-beach-live bg-beach-surface px-2 py-1 text-body font-semibold">
          {T.submitted}
        </p>
      ) : confirming ? (
        <div role="alertdialog" aria-label={T.confirm} className="flex items-center justify-between gap-2 rounded-lg border border-beach-border bg-beach-surface px-2 py-1">
          <p className="min-w-0 text-body font-semibold">{T.confirm}</p>
          <span className="flex shrink-0 gap-1">
            <Chip variant="accent" onClick={() => { setConfirming(false); onSubmit(); }}>
              {T.confirmYes}
            </Chip>
            <Chip onClick={() => setConfirming(false)}>{T.confirmNo}</Chip>
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 text-small font-medium text-beach-muted">{complete ? "" : T.submitWaiting}</p>
          <Chip variant={complete ? "accent" : "muted"} disabled={!complete} onClick={() => setConfirming(true)}>
            {T.submit}
          </Chip>
        </div>
      )}
    </div>
  );
}
