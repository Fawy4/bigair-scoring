import { useId, type ComponentProps, type MouseEventHandler, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Per screen exactly one primary (teal fill), then secondary (1 px frame), quiet (text and icon) and danger (red, only for something that cannot be undone). */
export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

interface Base {
  variant?: ButtonVariant;
  icon?: LucideIcon;
  /** Icon only: give it an aria-label. */
  iconOnly?: boolean;
  /** Renders a link that looks like the button. */
  href?: string;
  /** With href: "_blank" opens a new tab. */
  target?: "_blank";
  className?: string;
  children?: ReactNode;
}

/** A disabled button must say why (an icon-only one keeps the reason as its title; its label already says what it does): `disabledReason` is required then and is printed under the button (a tap cannot open a tooltip). */
export type ButtonProps = Base &
  Omit<ComponentProps<"button">, keyof Base | "disabled"> &
  ({ disabled?: false; disabledReason?: undefined } | { disabled: true; disabledReason: string });

const VARIANT: Record<ButtonVariant, string> = {
  primary: "border-beach-accent bg-beach-accent text-beach-on-accent",
  secondary: "border-beach-border bg-beach-bg text-beach-ink hover:bg-beach-surface",
  quiet: "border-transparent bg-transparent text-beach-ink hover:bg-beach-surface",
  danger: "border-beach-crash bg-beach-bg text-beach-crash hover:bg-beach-surface",
};
// A disabled control is never faded to light grey: it keeps full-strength text, a dashed frame and a flat fill, and its reason sits under it.
const DISABLED = "cursor-not-allowed border-dashed border-beach-border bg-beach-surface text-beach-muted";

export function Button({ variant = "secondary", icon: Icon, iconOnly, href, target, className, children, disabled, disabledReason, type = "button", ...rest }: ButtonProps) {
  const reasonId = useId();
  const classes = cn(
    "inline-flex min-h-[var(--org-ctl)] items-center justify-center gap-2 rounded-[8px] border px-3 py-1.5 text-body font-semibold",
    disabled ? DISABLED : VARIANT[variant],
    iconOnly && "min-w-[var(--org-ctl)] px-0",
    className,
  );
  const inside = (
    <>
      {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
      {iconOnly ? null : children}
    </>
  );
  const control =
    href && !disabled ? (
      <a href={href} target={target} rel={target ? "noopener noreferrer" : undefined} data-variant={variant} className={classes} aria-label={rest["aria-label"]} data-testid={(rest as Record<string, unknown>)["data-testid"] as string | undefined} onClick={rest.onClick as unknown as MouseEventHandler<HTMLAnchorElement>}>
        {inside}
      </a>
    ) : (
      <button {...rest} type={type} disabled={disabled} data-variant={variant} title={disabled && iconOnly ? disabledReason : rest.title} aria-describedby={disabled && !iconOnly ? reasonId : rest["aria-describedby"]} className={classes}>
        {inside}
      </button>
    );
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      {control}
      {disabled && !iconOnly ? (
        <span id={reasonId} data-testid="disabled-reason" className="max-w-[32ch] text-small font-medium text-beach-muted">
          {disabledReason}
        </span>
      ) : null}
    </span>
  );
}

/** Props that disable a Button and give its reason, or nothing: `<Button {...disabledWhen(pending && "Working…")}>`. */
export function disabledWhen(reason: string | false | null | undefined): { disabled: true; disabledReason: string } | Record<string, never> {
  return reason ? { disabled: true as const, disabledReason: reason } : {};
}
