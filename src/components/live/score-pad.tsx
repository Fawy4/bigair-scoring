"use client";

import { useState } from "react";
import { combinePad, formatPadValue, isAllowed, padLayout } from "@/lib/live/score-pad";
import type { Scale } from "@/lib/schemas/scoring-model";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

// Pad buttons are `--size-pad-height` tall (Normal 46 px, Large 56 px) with a `--size-pad-gap` gap; the grid fits as many as the width allows.
const GRID: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(var(--size-pad-height), 1fr))", gap: "var(--size-pad-gap)" };

function PadButton({ selected, disabled, onClick, children, label }: { selected: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      data-pad-button
      aria-pressed={selected}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{ height: "var(--size-pad-height)" }}
      className={cn(
        "min-w-0 rounded-xl text-digit",
        // weight 700 is for the selected score only
        selected ? "border border-beach-accent bg-beach-accent font-bold text-beach-on-accent" : disabled ? "border border-beach-line bg-beach-surface font-semibold text-beach-muted" : "border border-beach-border bg-beach-bg font-semibold text-beach-ink",
      )}
    >
      {children}
    </button>
  );
}

/**
 * One scale, tap to set. A short scale is one row and one tap scores. A long one (0–10 in tenths) is two rows: tap the whole number, then the decimal;
 * the score is set (and `onChange` fires) on the decimal tap. Only values on the step can be produced, so an off-step score such as 8.55 on a 0.1 pad
 * cannot happen (docs/08 §1F). `caption` is the line to the left of the selected score (the label, or the "Saved …" confirmation).
 */
export function ScorePad({ scale, value, onChange, label, caption, disabled = false }: { scale: Scale; value: number | null; onChange: (value: number) => void; label: string; caption?: React.ReactNode; disabled?: boolean }) {
  const layout = padLayout(scale);
  const [pending, setPending] = useState<number | null>(null);
  const commit = (v: number | null) => {
    if (v === null || disabled) return;
    const check = isAllowed(v, scale);
    if (check.ok) {
      setPending(null);
      onChange(check.value);
    }
  };
  const whole = pending ?? (value === null ? null : Math.floor(value + 1e-9));
  const fraction = pending !== null || value === null ? null : Number((value - Math.floor(value + 1e-9)).toFixed(6));
  const dec = (f: number) => `.${String(f).split(".")[1] ?? "0"}`;
  const shown = pending !== null ? `${pending}.` : value === null ? copy.live.pad.none : formatPadValue(value, scale);
  return (
    <div data-testid="score-pad" className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 text-small font-medium text-beach-muted">{caption ?? label}</div>
        <output
          data-testid="pad-value"
          aria-label={`${copy.live.pad.current}: ${value === null ? copy.live.pad.notSet : formatPadValue(value, scale)}`}
          className={cn("min-w-[3.5rem] text-right text-readout tabular-nums", value === null && pending === null ? "font-semibold text-beach-muted" : "font-bold text-beach-ink")}
        >
          {shown}
        </output>
      </div>
      {layout.kind === "single" ? (
        <div style={GRID}>
          {layout.values.map((v) => (
            <PadButton key={v} selected={value !== null && Math.abs(value - v) < 1e-9} disabled={disabled} onClick={() => commit(v)} label={copy.live.pad.value(formatPadValue(v, scale))}>
              {formatPadValue(v, scale)}
            </PadButton>
          ))}
        </div>
      ) : (
        <>
          <div style={GRID}>
            {layout.wholes.map((w) => (
              <PadButton key={w} selected={whole === w} disabled={disabled || combinePad(w, 0, scale) === null} onClick={() => setPending(w)} label={copy.live.pad.value(String(w))}>
                {w}
              </PadButton>
            ))}
          </div>
          <div style={GRID} aria-label={copy.live.pad.decimal}>
            {layout.fractions.map((f) => {
              const next = whole === null ? null : combinePad(whole, f, scale);
              return (
                <PadButton key={f} selected={fraction !== null && Math.abs(fraction - f) < 1e-9} disabled={disabled || next === null} onClick={() => commit(next)} label={copy.live.pad.value(dec(f))}>
                  {dec(f)}
                </PadButton>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
