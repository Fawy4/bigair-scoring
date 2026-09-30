import { riderLabelModel, type LabelRider } from "@/lib/identification/rider-label";
import { copy } from "@/lib/ui-copy";
import type { IdentificationScheme } from "@/lib/schemas/identification";
import { cn } from "@/lib/utils";

/**
 * THE rider label: the same component on every screen (judge, spotter, head judge, public, exports; CLAUDE.md rule 7).
 * Colours are always written out as text; white and black get an outline (docs/06 §00.5).
 */
export function RiderLabel({ scheme, rider, size = "md", className }: { scheme: IdentificationScheme; rider: LabelRider; size?: "sm" | "md" | "lg"; className?: string }) {
  const label = riderLabelModel(scheme, rider);
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
        style={p.hex ? { backgroundColor: p.hex, color: p.ink, boxShadow: p.outlined ? "inset 0 0 0 3px #111" : undefined } : undefined}
      >
        <span>{p.text}</span>
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
