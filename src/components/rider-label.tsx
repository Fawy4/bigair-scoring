import { riderLabelModel, type LabelModel, type LabelRider } from "@/lib/identification/rider-label";
import { copy } from "@/lib/ui-copy";
import type { IdentificationScheme } from "@/lib/schemas/identification";
import { cn } from "@/lib/utils";

/**
 * THE rider label: the same component on every screen (judge, spotter, head judge, public, exports; CLAUDE.md rule 7).
 * Colours are always written out as text; white and black get an outline (docs/06 §00.5).
 */
export function RiderLabel({
  scheme,
  rider,
  size = "md",
  className,
  model,
  variant = "block",
  bare = false,
}: {
  scheme?: IdentificationScheme;
  rider?: LabelRider;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** A label that is already worked out (the live screens pass this). Without it, `scheme` and `rider` are needed. */
  model?: LabelModel;
  /**
   * "block" is the organiser look (a block of Lycra colour). "stripe" is the calm look of the official screens: a thick stripe and a dot in the Lycra colour,
   * the colour word and the name in ink (so they read at 7:1 whatever the Lycra colour), white and black outlined in the page ink.
   */
  variant?: "block" | "stripe";
  /** Stripe only: no frame of its own, because the tile or card around it has one (the selected rider gets the accent border there). */
  bare?: boolean;
}) {
  const label = model ?? riderLabelModel(scheme!, rider!);
  const p = label.primary;
  if (variant === "stripe") {
    const name = label.secondary.find((x) => x.key === "name");
    const rest = label.secondary.filter((x) => x.key !== "name");
    const isColour = p.kind === "colour";
    const primaryIsName = !isColour && p.text === name?.text;
    return (
      <div data-testid="rider-label" data-variant="stripe" className={cn("flex min-w-0 items-stretch gap-3", !bare && "rounded-card border border-beach-line bg-beach-bg px-3 py-2", className)}>
        <span
          aria-hidden
          data-testid="rider-label-stripe"
          className="w-[6px] shrink-0 rounded-full"
          style={{ backgroundColor: p.hex ?? "var(--beach-border)", boxShadow: p.outlined && p.hex ? "inset 0 0 0 1.5px var(--beach-ink)" : undefined }}
        />
        <div className="flex min-w-0 flex-col justify-center">
          <div data-testid="rider-label-primary" className="flex items-center gap-2">
            {isColour ? (
              <span
                aria-hidden
                data-testid="rider-label-dot"
                className="size-[18px] shrink-0 rounded-full"
                style={{ backgroundColor: p.hex, boxShadow: p.outlined ? "inset 0 0 0 2px var(--beach-ink)" : undefined }}
              />
            ) : null}
            <span data-testid="rider-label-text" className={cn("truncate font-semibold text-beach-ink", isColour ? "text-body tracking-wide" : "text-name")}>
              {p.text}
            </span>
            {isColour && p.usedFallback ? <span className="text-small font-medium text-beach-muted">{copy.riderLabel.fallback}</span> : null}
          </div>
          {name && !primaryIsName ? <span className="truncate text-name font-semibold text-beach-ink">{name.text}</span> : null}
          {rest.map((x) => (
            <span key={x.key + x.text} className="truncate text-small font-medium text-beach-muted">
              {x.text}
            </span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div data-testid="rider-label" className={cn("inline-flex max-w-full items-stretch overflow-hidden rounded-lg border-2 border-[#111] bg-white text-[#111]", className)}>
      <div
        data-testid="rider-label-primary"
        className={cn(
          "flex min-w-[5.5rem] flex-col items-center justify-center px-3 py-2 text-center font-extrabold leading-tight",
          size === "lg" ? "text-3xl" : size === "md" ? "text-2xl" : "text-xl",
          p.outlined ? "border-r-2 border-[#111]" : "",
        )}
        style={p.hex ? { backgroundColor: p.hex, color: p.ink, boxShadow: p.outlined ? "inset 0 0 0 3px #111" : undefined } : undefined}
      >
        <span data-testid="rider-label-text">{p.text}</span>
        {p.kind === "colour" && p.usedFallback ? <span className="text-xs font-bold">{copy.riderLabel.fallback}</span> : null}
      </div>
      <div className="flex flex-col justify-center gap-0.5 px-3 py-2">
        {label.secondary.map((s) => (
          <span key={s.key + s.text} className={cn("font-semibold", s.key === "name" ? "text-xl font-bold" : "text-base")}>
            {s.text}
          </span>
        ))}
      </div>
    </div>
  );
}
