"use client";

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/org/button";
import { HelpTip } from "@/components/org/help-tip";
import { OrgCard } from "@/components/org/org-card";
import type { Help } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

/** A card of the panel: the shared organiser card (1 px line, 12 px corners, a 14 px title) with the "?" at the right of its title. */
export function Card({ title, help, helpWhat, children, className, testId }: { title: string; help?: Help; helpWhat?: string; children: React.ReactNode; className?: string; testId?: string }) {
  return (
    <OrgCard title={title} testId={testId} className={className} actions={help ? <HelpTip what={helpWhat ?? title} text={help.text} example={help.example} /> : undefined}>
      <div className="flex flex-col gap-3">{children}</div>
    </OrgCard>
  );
}

/** A label with its "?" (a tap: one sentence and an example) above a row of choices. */
export function Field({ label, help, children }: { label: string; help?: Help; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center">
        <span className="text-body font-semibold">{label}</span>
        {help ? <HelpTip what={label} text={help.text} example={help.example} /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/**
 * One choice of a row (Speed ×10, 5 attempts, Virtual / Real): the control height of the organiser screens, the chosen one filled with the accent and marked "pressed".
 * While an action is on its way it is unavailable (the toolbar says "Working…" once, so it does not print a reason under every choice).
 */
export function Choice({ pressed, primary, icon: Icon, className, children, ...rest }: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> & { pressed?: boolean; primary?: boolean; icon?: LucideIcon }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "inline-flex min-h-[var(--org-ctl)] min-w-[var(--org-ctl)] items-center justify-center gap-2 rounded-[8px] border px-3 text-body font-semibold",
        pressed || primary ? "border-beach-accent bg-beach-accent text-beach-on-accent" : "border-beach-border bg-beach-bg text-beach-ink hover:bg-beach-surface",
        "disabled:cursor-not-allowed disabled:border-dashed disabled:border-beach-border disabled:bg-beach-surface disabled:text-beach-muted",
        className,
      )}
      {...rest}
    >
      {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
      {children}
    </button>
  );
}

/** A link that looks like a secondary button and opens in a new tab (View as…). */
export function LinkButton({ href, icon, children, testId }: { href: string; icon?: LucideIcon; children: React.ReactNode; testId?: string }) {
  return (
    <Button variant="secondary" icon={icon} href={href} target="_blank" data-testid={testId} className="w-full">
      {children}
    </Button>
  );
}
