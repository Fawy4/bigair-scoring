"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { HeatSummaryCard } from "./heat-summary-card";
import { ScorePad } from "./score-pad";
import { RiderLabel } from "@/components/rider-label";
import type { ImpressionRider } from "@/lib/live/design-fixtures";
import type { Scale } from "@/lib/schemas/scoring-model";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

/**
 * The judge's step after the heat: one Impression / Variety score per rider, the heat summary above each pad, progress "2 / 3 riders",
 * and Submit sheet (one confirmation, then read-only). Controlled: the parent keeps the values.
 */
export function ImpressionCard({
  riders,
  scale,
  values,
  onChange,
  submitted,
  onSubmit,
}: {
  riders: ImpressionRider[];
  scale: Scale;
  values: Record<string, number | null>;
  onChange: (riderId: string, value: number) => void;
  submitted: boolean;
  onSubmit: () => void;
}) {
  const T = copy.live.impression;
  const [confirming, setConfirming] = useState(false);
  const done = riders.filter((r) => values[r.id] !== null && values[r.id] !== undefined).length;
  const complete = done === riders.length;
  const button = "inline-flex min-h-[3.5rem] items-center justify-center gap-2 rounded-lg border-2 border-beach-border px-5 text-xl font-extrabold";
  return (
    <div data-testid="impression-card" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-2xl font-extrabold">{T.heading}</h3>
        <span data-testid="impression-progress" className="rounded-full border-2 border-beach-border bg-beach-surface px-4 py-1 text-xl font-extrabold tabular-nums">
          {T.progress(done, riders.length)}
        </span>
      </div>
      {riders.map((r) => {
        const set = values[r.id] !== null && values[r.id] !== undefined;
        return (
          <section key={r.id} data-testid="impression-rider" className="flex flex-col gap-3 rounded-lg border-2 border-beach-border bg-beach-bg p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <RiderLabel model={r.label} size="md" nameplate />
              <span className={cn("inline-flex min-h-tap items-center gap-2 rounded-full border-2 px-4 text-lg font-extrabold", set ? "border-beach-live text-beach-live" : "border-dashed border-beach-missing text-beach-missing")}>
                {set ? <Check aria-hidden className="size-6" /> : null}
                {set ? T.riderDone : T.riderOpen}
              </span>
            </div>
            <HeatSummaryCard summary={r.summary} />
            <ScorePad scale={scale} value={values[r.id] ?? null} onChange={(v) => onChange(r.id, v)} label={T.heading} disabled={submitted} />
          </section>
        );
      })}
      {submitted ? (
        <p data-testid="submitted-note" className="rounded-lg border-4 border-beach-live bg-beach-surface p-3 text-xl font-extrabold text-beach-live">
          {T.submitted}
        </p>
      ) : confirming ? (
        <div role="alertdialog" aria-label={T.confirm} className="flex flex-col gap-3 rounded-lg border-4 border-beach-border bg-beach-surface p-3">
          <p className="text-xl font-extrabold">{T.confirm}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={cn(button, "bg-beach-selected text-beach-on-selected")} onClick={() => { setConfirming(false); onSubmit(); }}>
              {T.confirmYes}
            </button>
            <button type="button" className={cn(button, "bg-beach-bg text-beach-ink")} onClick={() => setConfirming(false)}>
              {T.confirmNo}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <button type="button" disabled={!complete} onClick={() => setConfirming(true)} className={cn(button, complete ? "bg-beach-selected text-beach-on-selected" : "border-dashed bg-beach-surface text-beach-missing")}>
            {T.submit}
          </button>
          {!complete ? <p className="text-lg font-bold text-beach-muted">{T.submitWaiting}</p> : null}
        </div>
      )}
    </div>
  );
}
