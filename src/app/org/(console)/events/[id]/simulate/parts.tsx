"use client";

import { useId, useState } from "react";
import { HelpTip } from "@/components/live/help-tip";
import { cn } from "@/lib/utils";
import type { Help } from "@/lib/ui-copy";

/** A card of the panel: the compact beach look (a soft line, no shadow, a small heading), one per section. */
export function Card({ title, help, helpWhat, children, className, testId }: { title: string; help?: Help; helpWhat?: string; children: React.ReactNode; className?: string; testId?: string }) {
  return (
    <section data-testid={testId} aria-label={title} className={cn("flex flex-col gap-2 rounded-card border border-beach-line bg-beach-surface p-3", className)}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-heading font-semibold uppercase tracking-wide text-beach-muted">{title}</h2>
        {help ? <HelpTip what={helpWhat ?? title} text={help.example ? `${help.text} ${help.example}` : help.text} /> : null}
      </div>
      {children}
    </section>
  );
}

/** A label with its "?" (a tap: one sentence and an example) above a row of choices. */
export function Field({ label, help, children }: { label: string; help?: Help; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-body font-semibold">{label}</span>
        {help ? (
          <button type="button" aria-expanded={open} aria-controls={id} aria-label={label} onClick={() => setOpen((o) => !o)} className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-full border border-beach-border bg-beach-bg text-body font-semibold text-beach-ink aria-expanded:bg-beach-accent aria-expanded:text-beach-on-accent">
            ?
          </button>
        ) : null}
      </div>
      {open && help ? (
        <p id={id} role="note" className="rounded-xl border border-beach-line bg-beach-bg p-2 text-body font-medium">
          {help.text}
          {help.example ? ` ${help.example}` : ""}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

/** A link that looks like a Chip and opens in a new tab (View as…). */
export function LinkChip({ href, children, testId }: { href: string; children: React.ReactNode; testId?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testId}
      className="inline-flex min-h-tap min-w-tap items-center justify-center gap-1 rounded-lg border border-beach-border bg-beach-bg px-1.5 text-body font-semibold leading-none text-beach-ink"
    >
      {children}
    </a>
  );
}
