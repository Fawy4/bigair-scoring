"use client";

import { combinePad, formatPadValue, isAllowed, padLayout } from "@/lib/live/score-pad";
import type { Scale } from "@/lib/schemas/scoring-model";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-2"; // 8 px gaps (docs/06 §00.2)

function PadButton({ selected, disabled, onClick, children, label }: { selected: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      data-pad-button
      aria-pressed={selected}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-h-[60px] min-w-pad rounded-lg text-pad-digit",
        selected ? "border-4 border-beach-border bg-beach-selected text-beach-on-selected" : disabled ? "border-2 border-dashed border-beach-missing bg-beach-surface text-beach-missing" : "border-2 border-beach-border bg-beach-bg text-beach-ink",
      )}
    >
      {children}
    </button>
  );
}

/**
 * One scale, tap to set. A short scale is one row of buttons; a long one is two taps: a whole number, then a decimal.
 * Tapping a whole number already sets a valid score (7 means 7.0); the decimal row refines it. Only values on the step can be produced,
 * so an off-step score such as 8.55 on a 0.1 pad cannot happen (docs/08 §1F).
 */
export function ScorePad({ scale, value, onChange, label, disabled = false }: { scale: Scale; value: number | null; onChange: (value: number) => void; label: string; disabled?: boolean }) {
  const layout = padLayout(scale);
  const set = (v: number | null) => {
    if (v === null || disabled) return;
    const check = isAllowed(v, scale);
    if (check.ok) onChange(check.value);
  };
  const whole = value === null ? null : Math.floor(value + 1e-9);
  const fraction = value === null || whole === null ? null : Number((value - whole).toFixed(6));
  return (
    <div data-testid="score-pad" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xl font-extrabold">{label}</span>
        <output data-testid="pad-value" aria-label={`${copy.live.pad.current}: ${value === null ? copy.live.pad.notSet : formatPadValue(value, scale)}`} className="min-w-[5rem] rounded-lg border-2 border-beach-border bg-beach-bg px-3 py-1 text-center text-4xl font-extrabold tabular-nums">
          {value === null ? copy.live.pad.none : formatPadValue(value, scale)}
        </output>
      </div>
      {layout.kind === "single" ? (
        <div className={GRID}>
          {layout.values.map((v) => (
            <PadButton key={v} selected={value !== null && Math.abs(value - v) < 1e-9} disabled={disabled} onClick={() => set(v)} label={copy.live.pad.value(formatPadValue(v, scale))}>
              {formatPadValue(v, scale)}
            </PadButton>
          ))}
        </div>
      ) : (
        <>
          <div>
            <p className="mb-1 text-base font-bold text-beach-muted">{copy.live.pad.whole}</p>
            <div className={GRID}>
              {layout.wholes.map((w) => {
                const next = combinePad(w, fraction ?? 0, scale) ?? combinePad(w, 0, scale);
                return (
                  <PadButton key={w} selected={whole === w} disabled={disabled || (next === null && combinePad(w, 0, scale) === null)} onClick={() => set(next)} label={copy.live.pad.value(String(w))}>
                    {w}
                  </PadButton>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-1 text-base font-bold text-beach-muted">{copy.live.pad.tenths}</p>
            <div className={GRID}>
              {layout.fractions.map((f) => {
                const next = whole === null ? null : combinePad(whole, f, scale);
                return (
                  <PadButton key={f} selected={fraction !== null && Math.abs(fraction - f) < 1e-9} disabled={disabled || next === null} onClick={() => set(next)} label={copy.live.pad.value(`.${String(f).split(".")[1] ?? "0"}`)}>
                    {`.${String(f).split(".")[1] ?? "0"}`}
                  </PadButton>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
