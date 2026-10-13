import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChipVariant = "plain" | "accent" | "danger" | "muted";

/**
 * The pill button of the official screens (New look): fully round, at least 44 px high (the tap size), words in Bold Rubik.
 * At rest a soft filled shape with a thin hairline; `pressed` is the selected state (teal fill); `variant` "accent" is the one orange main action ("act now"), "danger" the red one.
 */
export function Chip({
  onBoard = false,
  variant = "plain",
  pressed,
  icon: Icon,
  className,
  children,
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> & { variant?: ChipVariant; pressed?: boolean; icon?: LucideIcon; /** On the scoreboard bar: outlined in the board grey, white when on. */ onBoard?: boolean }) {
  const tone = onBoard
    ? pressed
      ? "border-beach-on-board bg-beach-on-board text-beach-board"
      : "border-beach-board-muted bg-transparent text-beach-on-board"
    : pressed
      ? "border-beach-selected bg-beach-selected text-beach-on-selected"
      : variant === "accent"
        ? "border-beach-accent bg-beach-accent text-beach-on-accent"
        : variant === "danger"
          ? "border-beach-crash bg-beach-crash text-beach-on-crash"
          : variant === "muted" || rest.disabled
            ? "border-transparent bg-beach-surface text-beach-muted"
            : "border-beach-border bg-beach-fill text-beach-ink";
  return (
    <button type="button" data-chip aria-pressed={pressed} className={cn("inline-flex min-h-tap min-w-tap items-center justify-center gap-1 rounded-full border px-4 text-body font-bold leading-none", tone, className)} {...rest}>
      {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
      {children}
    </button>
  );
}

/**
 * A switch of two or three choices drawn as one soft track with a pill for the chosen one (teal, with its word): the Queue / Rider sheet switch, Rider sheet / Trick list, Daylight / Dark, Normal / Large.
 * Every segment is a 44 px button with aria-pressed, so the choice is never colour alone.
 */
export function PillSwitch<T extends string>({ label, value, options, onChange, testId, className }: { label: string; value: T; options: Array<{ key: T; text: string; testId?: string }>; onChange: (v: T) => void; testId?: string; className?: string }) {
  return (
    <div role="group" aria-label={label} data-testid={testId} className={cn("inline-flex items-center gap-0.5 rounded-full border border-beach-border bg-beach-fill p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          data-testid={o.testId}
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn("inline-flex h-11 min-w-11 items-center justify-center rounded-full px-4 text-body font-bold leading-none", value === o.key ? "bg-beach-selected text-beach-on-selected" : "bg-transparent text-beach-ink")}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}
