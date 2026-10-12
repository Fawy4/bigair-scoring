import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChipVariant = "plain" | "accent" | "danger" | "muted";

/**
 * The pill button of the official screens (New look): fully round, at least 44 px high (the tap size), words in Bold Rubik.
 * `pressed` is the selected state (orange fill, black words); `variant` "accent" is the one strong-colour main action, "danger" the CRASH button.
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
    <button type="button" data-chip aria-pressed={pressed} className={cn("inline-flex min-h-tap min-w-tap items-center justify-center gap-1 rounded-full border px-4 text-body font-bold leading-none", tone, className)} {...rest}>
      {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
      {children}
    </button>
  );
}
