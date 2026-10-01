"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { decimalsOf, numberFieldWidth, type NumberRange } from "./number-field-width";
import "./org-tokens.css";

interface NumberFieldProps extends NumberRange {
  /** The accessible name: what the number is. */
  label: string;
  /** null = empty (only with `onClear`: "automatic"). */
  value: number | null;
  onChange: (value: number) => void;
  /** Leaving the box empty is allowed and means "automatic" (the setting is removed). */
  onClear?: () => void;
  placeholder?: string;
  disabled?: boolean;
  /** Where the digits sit in the box. The owner asked for right-aligned; centred is the plan's first draft, shown beside it for comparison. */
  align?: "end" | "center";
  /** A word after the box ("min", "judges"). */
  unit?: string;
  id?: string;
}

/**
 * A number box as wide as its largest value, never full width. Opens the number keypad on a phone and shows tabular digits.
 * While you type, a half-typed or empty box is left alone; leaving the box puts back the last good number, kept inside the allowed range.
 */
export function NumberField({ label, value, onChange, onClear, placeholder, disabled, min = 0, max, step = 1, align = "end", unit, id }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const decimals = decimalsOf(step);
  const finish = () => {
    if (draft !== null && draft.trim() !== "" && Number.isFinite(Number(draft))) {
      const clamped = Math.min(max, Math.max(min, Number(draft)));
      if (clamped !== value) onChange(clamped);
    } else if (draft !== null && draft.trim() === "" && onClear && value !== null) onClear();
    setDraft(null);
  };
  return (
    <span className="inline-flex items-center gap-2">
      <input
        id={id}
        data-testid="number-field"
        type="number"
        inputMode={decimals > 0 ? "decimal" : "numeric"}
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={draft ?? (value === null ? "" : String(value))}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          setDraft(e.target.value);
          if (e.target.value.trim() === "" && onClear) return;
          const n = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
        onBlur={finish}
        style={{ width: numberFieldWidth({ min, max, step, minChars: placeholder?.length }) }}
        className={cn(
          "org-number h-[var(--org-ctl)] min-w-[var(--org-ctl)] rounded-[8px] border border-beach-border bg-beach-bg px-3 text-digit font-semibold tabular-nums text-beach-ink",
          align === "end" ? "text-right" : "text-center",
        )}
      />
      {unit ? <span className="text-body font-medium text-beach-muted">{unit}</span> : null}
    </span>
  );
}
