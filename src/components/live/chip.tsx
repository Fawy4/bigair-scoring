import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChipVariant = "plain" | "accent" | "danger" | "muted";

/**
 * A button no wider than its text plus 12 px (owner, round 4), at least as tall as the Normal tap size (36 px; 44 px in Large).
 * `pressed` is the selected state (accent fill); `variant` "accent" is the primary button, "danger" the CRASH button.
 */
export function Chip({
  variant = "plain",
  pressed,
  icon: Icon,
  className,
  children,
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> & { variant?: ChipVariant; pressed?: boolean; icon?: LucideIcon }) {
  const tone =
    pressed || variant === "accent"
      ? "border-beach-accent bg-beach-accent text-beach-on-accent"
      : variant === "danger"
        ? "border-beach-crash bg-beach-crash text-beach-on-crash"
        : variant === "muted" || rest.disabled
          ? "border-beach-line bg-beach-surface text-beach-muted"
          : "border-beach-border bg-beach-bg text-beach-ink";
  return (
    <button type="button" data-chip aria-pressed={pressed} className={cn("inline-flex min-h-tap min-w-tap items-center justify-center gap-1 rounded-lg border px-1.5 text-body font-semibold leading-none", tone, className)} {...rest}>
      {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
      {children}
    </button>
  );
}
