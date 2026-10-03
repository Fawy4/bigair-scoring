"use client";

import { useState } from "react";
import { Chip } from "./chip";
import { errorSentence } from "@/lib/live/errors";
import { combinePad, formatPadValue, isAllowed, padLayout, padRefusal, parsePadInput } from "@/lib/live/score-pad";
import { LearnMore } from "@/components/manual/learn-more";
import type { Scale } from "@/lib/schemas/scoring-model";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

// Pad buttons are `--size-pad-height` square (Normal 38 px, Large 46 px) with a `--size-pad-gap` gap; the rows wrap inside the space left of the number column.
const ROW: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "var(--size-pad-gap)" };

function PadButton({ selected, disabled, onClick, children, label }: { selected: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      data-pad-button
      aria-pressed={selected}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{ height: "var(--size-pad-height)", width: "var(--size-pad-height)" }}
      className={cn(
        "shrink-0 rounded-lg text-digit",
        // weight 700 is for the selected score only
        selected ? "border border-beach-accent bg-beach-accent font-bold text-beach-on-accent" : disabled ? "border border-beach-line bg-beach-surface font-semibold text-beach-muted" : "border border-beach-border bg-beach-bg font-semibold text-beach-ink",
      )}
    >
      {children}
    </button>
  );
}

/**
 * One scale, tap or type (owner, round 4). Two rows: the whole number, then the decimal; beside them the selected score, a small number field with the numeric
 * keyboard, and Save. A whole number alone is a valid score: after tapping it, Save completes it (the decimal is optional) and a decimal tap completes it too.
 * Typing a score then Save completes it. A short scale is one row and one tap scores. Only values on the step can be produced, so an off-step score such as
 * 8.55 on a 0.1 pad cannot happen (docs/08 §1F). `caption` is the line above the pad (the label, or the "Saved …" confirmation).
 */
export function ScorePad({ scale, value, onChange, label, caption, disabled = false }: { scale: Scale; value: number | null; onChange: (value: number) => void; label: string; caption?: React.ReactNode; disabled?: boolean }) {
  const layout = padLayout(scale);
  const [pending, setPending] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const typed = parsePadInput(draft, scale);
  const refusal = padRefusal(draft, scale);
  const commit = (v: number | null) => {
    if (v === null || disabled) return;
    const check = isAllowed(v, scale);
    if (check.ok) {
      setPending(null);
      setDraft("");
      onChange(check.value);
    }
  };
  const canSave = !disabled && (typed.ok || (draft.trim() === "" && pending !== null));
  const save = () => commit(typed.ok ? typed.value : pending);
  const whole = pending ?? (value === null ? null : Math.floor(value + 1e-9));
  const fraction = pending !== null || value === null ? null : Number((value - Math.floor(value + 1e-9)).toFixed(6));
  const dec = (f: number) => `.${String(f).split(".")[1] ?? "0"}`;
  const shown = pending !== null ? `${pending}.` : value === null ? copy.live.pad.none : formatPadValue(value, scale);
  return (
    <div data-testid="score-pad" className="flex flex-col gap-1">
      <div className="min-w-0 truncate text-small font-medium text-beach-muted">{caption ?? label}</div>
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col" style={{ gap: "var(--size-pad-gap)" }}>
          {layout.kind === "single" ? (
            <div style={ROW}>
              {layout.values.map((v) => (
                <PadButton key={v} selected={value !== null && Math.abs(value - v) < 1e-9} disabled={disabled} onClick={() => commit(v)} label={copy.live.pad.value(formatPadValue(v, scale))}>
                  {formatPadValue(v, scale)}
                </PadButton>
              ))}
            </div>
          ) : (
            <>
              <div style={ROW}>
                {layout.wholes.map((w) => (
                  <PadButton key={w} selected={whole === w} disabled={disabled || combinePad(w, 0, scale) === null} onClick={() => setPending(w)} label={copy.live.pad.value(String(w))}>
                    {w}
                  </PadButton>
                ))}
              </div>
              <div style={ROW} aria-label={copy.live.pad.decimal}>
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
        <div className="flex w-[4.75rem] shrink-0 flex-col items-stretch" style={{ gap: "var(--size-pad-gap)" }}>
          <output
            data-testid="pad-value"
            aria-label={`${copy.live.pad.current}: ${value === null ? copy.live.pad.notSet : formatPadValue(value, scale)}`}
            className={cn("text-right text-readout tabular-nums", value === null && pending === null ? "font-semibold text-beach-muted" : "font-bold text-beach-ink")}
          >
            {shown}
          </output>
          <input
            data-testid="pad-input"
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            aria-label={copy.live.pad.type}
            placeholder={copy.live.pad.typePlaceholder}
            value={draft}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) save();
            }}
            style={{ height: "var(--size-pad-height)" }}
            className={cn("w-full rounded-lg border bg-beach-bg px-1.5 text-center text-digit font-semibold text-beach-ink placeholder:text-beach-muted", draft.trim() !== "" && !typed.ok ? "border-beach-failed" : "border-beach-border")}
          />
          <Chip data-testid="pad-save" variant={canSave ? "accent" : "muted"} disabled={!canSave} onClick={save} className="self-end" style={{ height: "var(--size-pad-height)" }}>
            {copy.common.save}
          </Chip>
        </div>
      </div>
      {refusal ? (
        // the same sentence the server gives; the link goes to the judge page of the manual (the sentence is excluded from the automatic links, which point at the errors table)
        <p role="alert" data-testid="pad-refusal" data-no-learn-more className="text-small font-semibold text-beach-ink">
          {errorSentence(refusal.detail ? `${refusal.code}: ${refusal.detail}` : refusal.code)}
          <LearnMore href={copy.manual.href("ju-pad-step")} />
        </p>
      ) : null}
    </div>
  );
}
