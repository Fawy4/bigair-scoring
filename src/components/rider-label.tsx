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
  nameplate = false,
}: {
  scheme?: IdentificationScheme;
  rider?: LabelRider;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** A label that is already worked out (the live screens pass this). Without it, `scheme` and `rider` are needed. */
  model?: LabelModel;
  /**
   * Writes the colour name on a plain white plate over the Lycra colour. Text printed straight onto most Lycra colours (Red, Blue, Green, Orange,
   * Pink, Purple, Grey) cannot reach the 7:1 contrast of docs/06 §00.1; on the plate it always does. Used by the official screens.
   */
  nameplate?: boolean;
}) {
  const label = model ?? riderLabelModel(scheme!, rider!);
  const p = label.primary;
  return (
    <div data-testid="rider-label" className={cn("inline-flex max-w-full items-stretch overflow-hidden rounded-lg border-2 border-[#111] bg-white text-[#111]", className)}>
      <div
        data-testid="rider-label-primary"
        className={cn(
          "flex min-w-[5.5rem] flex-col items-center justify-center px-3 py-2 text-center font-extrabold leading-tight",
          size === "lg" ? "text-3xl" : size === "md" ? "text-2xl" : "text-xl",
          p.outlined ? "border-r-2 border-[#111]" : "",
        )}
        style={p.hex ? { backgroundColor: p.hex, color: nameplate ? "#111111" : p.ink, boxShadow: p.outlined ? "inset 0 0 0 3px #111" : undefined } : undefined}
      >
        <span data-testid="rider-label-text" className={nameplate && p.kind === "colour" ? "rounded-md border-2 border-[#111] bg-white px-2 py-0.5 text-[#111]" : undefined}>
          {p.text}
        </span>
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
