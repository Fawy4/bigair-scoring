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
  wrap = false,
  screen = false,
  seed,
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
  variant?: "block" | "live" | "row";
  /** Live only: no frame of its own, because the tile or card around it has one (the selected rider gets the accent border there). */
  bare?: boolean;
  /** Live only: long text wraps onto a second line instead of being cut with "…" (the Flag view and the big screen: nothing is ever cut there). */
  wrap?: boolean;
  /** Live only: drawn for a TV or projector (sizes in vw, colours from the big screen's Day / Dark ground; "Big screen — Follow the heat"). Never cut with "…". */
  screen?: boolean;
  /** Row only: the rider's seed, written small after the name. */
  seed?: number;
}) {
  const label = model ?? riderLabelModel(scheme!, rider!);
  const p = label.primary;
  if (variant === "row") {
    // the Draw step: the whole label on one line, small: the colour (or number) block, the name, the seed
    const style = labelStyleOfPrimary(p);
    const name = label.secondary.find((x) => x.key === "name");
    const nameText = style === "name-first" ? p.text : name?.text;
    return (
      <div data-testid="rider-label" data-variant="row" className={cn("flex min-w-0 items-center gap-1.5", className)}>
        {style === "colour-block" ? (
          <span
            data-testid="rider-label-primary"
            className="shrink-0 rounded px-1.5 text-sm font-bold leading-6"
            style={{ backgroundColor: p.hex, color: p.ink, boxShadow: p.outlined ? "inset 0 0 0 2px var(--beach-ink)" : undefined }}
          >
            <span data-testid="rider-label-text">{p.text}</span>
            {p.usedFallback ? <span className="ml-1 text-xs font-medium">{copy.riderLabel.fallback}</span> : null}
          </span>
        ) : style === "number-block" ? (
          <span data-testid="rider-label-primary" className="max-w-[45%] shrink-0 truncate rounded border-2 border-beach-ink bg-beach-surface px-1.5 text-sm font-bold leading-5 text-beach-ink">
            <span data-testid="rider-label-text">{p.text}</span>
          </span>
        ) : null}
        <span data-testid={style === "name-first" ? "rider-label-primary" : undefined} className="min-w-0 flex-1 truncate text-sm font-semibold leading-6 text-beach-ink">
          {style === "name-first" ? <span data-testid="rider-label-text">{nameText}</span> : nameText}
        </span>
        {seed != null ? (
          <span data-testid="rider-seed" className="shrink-0 text-xs font-medium text-beach-muted">
            #{seed}
          </span>
        ) : null}
      </div>
    );
  }
  if (variant === "live") {
    const style = labelStyleOfPrimary(p);
    const name = label.secondary.find((x) => x.key === "name");
    const rest = label.secondary.filter((x) => x.key !== "name");
    const nameText = style === "name-first" ? p.text : name?.text;
    const S = screen
      ? { gap: "gap-[1.2vw]", colour: "rounded-[0.6vw] px-[1vw] py-[0.1vw] text-[2.6vw] font-semibold leading-tight tracking-wide", number: "rounded-[0.6vw] border-[0.25vw] border-[var(--bs-ink)] bg-[var(--bs-bg)] px-[1vw] text-[2.6vw] font-semibold leading-tight text-[var(--bs-ink)]", name: "text-[2.8vw] font-semibold text-[var(--bs-ink)]", rest: "text-[1.8vw] font-medium text-[var(--bs-muted)]", ring: "var(--bs-ring)" }
      : { gap: "gap-2", colour: "rounded-lg px-2 py-0.5 text-name font-semibold leading-tight tracking-wide", number: "rounded-lg border-2 border-beach-ink bg-beach-surface px-2 py-0.5 text-name font-semibold leading-tight text-beach-ink", name: "text-name font-semibold text-beach-ink", rest: "text-small font-medium text-beach-muted", ring: "var(--beach-ink)" };
    return (
      <div data-testid="rider-label" data-variant="live" data-style={style} className={cn("flex min-w-0 items-center", S.gap, !bare && "rounded-card border border-beach-line bg-beach-bg p-1.5", className)}>
        {style === "colour-block" ? (
          <span
            data-testid="rider-label-primary"
            className={cn("shrink-0", S.colour)}
            style={{ backgroundColor: p.hex, color: p.ink, boxShadow: p.outlined ? `inset 0 0 0 ${screen ? "0.25vw" : "2px"} ${S.ring}` : undefined }}
          >
            <span data-testid="rider-label-text">{p.text}</span>
            {p.usedFallback ? <span className={cn("ml-1 font-medium", screen ? "text-[1.8vw]" : "text-small")}>{copy.riderLabel.fallback}</span> : null}
          </span>
        ) : style === "number-block" ? (
          <span data-testid="rider-label-primary" className={cn("max-w-[45%] shrink-0", S.number, wrap ? "break-words" : "truncate")}>
            <span data-testid="rider-label-text">{p.text}</span>
          </span>
        ) : null}
        <span className={cn("flex min-w-0 leading-tight", screen ? "flex-row flex-wrap items-baseline gap-x-[1.2vw]" : "flex-col")}>
          {nameText ? (
            <span data-testid={style === "name-first" ? "rider-label-primary" : undefined} className={cn(wrap ? "break-words" : "truncate", S.name)}>
              {style === "name-first" ? <span data-testid="rider-label-text">{nameText}</span> : nameText}
            </span>
          ) : null}
          {rest.length ? <span className={cn(wrap ? "break-words" : "truncate", S.rest)}>{rest.map((x) => x.text).join(" · ")}</span> : null}
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
