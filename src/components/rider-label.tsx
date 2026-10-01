import { riderLabelModel, type LabelModel, type LabelRider } from "@/lib/identification/rider-label";
import { copy } from "@/lib/ui-copy";
import type { IdentificationScheme } from "@/lib/schemas/identification";
import { cn } from "@/lib/utils";
import { labelStyleOfPrimary } from "@/lib/identification/label-style";

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
   * "block" is the organiser look. "live" is the look of the official screens: it picks its own style from the identification scheme (no manual switch):
   * a coloured block with the colour word for Lycra, rash-guard and helmet schemes, a number block for bib (and kite) schemes, the name first for name call-out.
   */
  variant?: "block" | "live";
  /** Live only: no frame of its own, because the tile or card around it has one (the selected rider gets the accent border there). */
  bare?: boolean;
}) {
  const label = model ?? riderLabelModel(scheme!, rider!);
  const p = label.primary;
  if (variant === "live") {
    const style = labelStyleOfPrimary(p);
    const name = label.secondary.find((x) => x.key === "name");
    const rest = label.secondary.filter((x) => x.key !== "name");
    const nameText = style === "name-first" ? p.text : name?.text;
    return (
      <div data-testid="rider-label" data-variant="live" data-style={style} className={cn("flex min-w-0 items-center gap-2", !bare && "rounded-card border border-beach-line bg-beach-bg p-1.5", className)}>
        {style === "colour-block" ? (
          <span
            data-testid="rider-label-primary"
            className="shrink-0 rounded-lg px-2 py-0.5 text-name font-semibold leading-tight tracking-wide"
            style={{ backgroundColor: p.hex, color: p.ink, boxShadow: p.outlined ? "inset 0 0 0 2px var(--beach-ink)" : undefined }}
          >
            <span data-testid="rider-label-text">{p.text}</span>
            {p.usedFallback ? <span className="ml-1 text-small font-medium">{copy.riderLabel.fallback}</span> : null}
          </span>
        ) : style === "number-block" ? (
          <span data-testid="rider-label-primary" className="max-w-[45%] shrink-0 truncate rounded-lg border-2 border-beach-ink bg-beach-surface px-2 py-0.5 text-name font-semibold leading-tight text-beach-ink">
            <span data-testid="rider-label-text">{p.text}</span>
          </span>
        ) : null}
        <span className="flex min-w-0 flex-col leading-tight">
          {nameText ? (
            <span data-testid={style === "name-first" ? "rider-label-primary" : undefined} className="truncate text-name font-semibold text-beach-ink">
              {style === "name-first" ? <span data-testid="rider-label-text">{nameText}</span> : nameText}
            </span>
          ) : null}
          {rest.length ? <span className="truncate text-small font-medium text-beach-muted">{rest.map((x) => x.text).join(" · ")}</span> : null}
        </span>
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
