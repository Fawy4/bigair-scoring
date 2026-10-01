"use client";

import { cn } from "@/lib/utils";

/** A native select in the organiser look: same height as every control. */
export function SelectField<T extends string>({ label, value, options, onChange, id }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void; id?: string }) {
  return (
    <select
      id={id}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-[var(--org-ctl)] max-w-full rounded-[8px] border border-beach-border bg-beach-bg px-3 text-body font-semibold text-beach-ink"
    >
      {options.map(([v, text]) => (
        <option key={v} value={v}>
          {text}
        </option>
      ))}
    </select>
  );
}

/** On / Off. The state is a word, not only a colour. */
export function Toggle({ label, checked, onChange, onText, offText }: { label: string; checked: boolean; onChange: (v: boolean) => void; onText: string; offText: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex min-h-[var(--org-ctl)] min-w-[var(--org-ctl)] items-center justify-center rounded-[8px] border px-4 text-body font-semibold",
        checked ? "border-beach-accent bg-beach-accent text-beach-on-accent" : "border-beach-border bg-beach-bg text-beach-ink",
      )}
    >
      {checked ? onText : offText}
    </button>
  );
}

/** Two or three buttons side by side; the chosen one is filled with the accent and marked "pressed". The word is always there. */
export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-[8px] border border-beach-border">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn("min-h-[var(--org-ctl)] min-w-[var(--org-ctl)] px-3 text-body font-semibold", value === v ? "bg-beach-accent text-beach-on-accent" : "bg-beach-bg text-beach-ink")}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
