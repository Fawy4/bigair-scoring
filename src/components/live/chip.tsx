import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChipVariant = "plain" | "accent" | "danger" | "dangerSolid" | "muted";

/**
 * The pill button of the official screens (New look): fully round, at least 44 px high (the tap size), words in Bold Rubik.
 * At rest white (Day) or near-black (Dark) with a thin edge; `pressed` is the selected state (teal fill); `variant` "accent" is the one orange main action ("act now"), "danger" a quiet red outline, "dangerSolid" solid red (only in a confirm dialog).
 */
export function Chip({
  compact = false,
  onBoard = false,
  variant = "plain",
  pressed,
  icon: Icon,
  className,
  children,
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> & { /** The small stacked size (32 px tall): only for the pairs beside a trick name. */ compact?: boolean; variant?: ChipVariant; pressed?: boolean; icon?: LucideIcon; /** On the scoreboard bar: outlined in the board grey, white when on. */ onBoard?: boolean }) {
  const tone = onBoard
    ? pressed
      ? "border-beach-on-board bg-beach-on-board text-beach-board"
      : "border-beach-board-muted bg-transparent text-beach-on-board"
    : pressed
      ? "border-beach-selected bg-beach-selected text-beach-on-selected"
      : variant === "accent"
        ? "border-beach-accent bg-beach-accent text-beach-on-accent"
        : variant === "dangerSolid"
          ? "border-beach-crash bg-beach-crash text-beach-on-crash"
          : variant === "danger"
            ? "border-beach-crash bg-beach-fill text-beach-crash"
            : "border-beach-border bg-beach-fill text-beach-ink";
  // a button that cannot be pressed keeps its shape with faded words, never a grey block
  const faded = variant === "muted" || rest.disabled ? "opacity-50" : "";
  return (
    <button type="button" data-chip aria-pressed={pressed} className={cn("inline-flex items-center justify-center gap-1 rounded-full border text-body font-bold leading-none", compact ? "h-8 px-1" : "min-h-tap min-w-tap px-4", tone, faded, className)} {...rest}>
      {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
      {children}
    </button>
  );
}

/**
 * A switch of two or three choices drawn as one soft track with a pill for the chosen one (teal, with its word): the Queue / Rider sheet switch, Rider sheet / Trick list, Daylight / Dark, Normal / Large.
 * Every segment is a button with aria-pressed (44 px, or 32 px in the slim `compact` size), so the choice is never colour alone.
 */
export function PillSwitch<T extends string>({ label, value, options, onChange, testId, className, compact = false }: {
  /** The slim size (32 px segments) for the view switches at the top of the Rider sheets, so they take less vertical space (the owner's choice). */
  compact?: boolean; label: string; value: T; options: Array<{ key: T; text: string; testId?: string }>; onChange: (v: T) => void; testId?: string; className?: string }) {
  return (
    <div role="group" aria-label={label} data-testid={testId} className={cn("inline-flex w-fit items-center gap-0.5 self-start rounded-full border border-beach-border bg-beach-fill p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          data-testid={o.testId}
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn("inline-flex min-w-11 items-center justify-center rounded-full text-body font-bold leading-none", compact ? "h-8 px-3" : "h-11 px-4", value === o.key ? "bg-beach-selected text-beach-on-selected" : "bg-transparent text-beach-ink")}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}
