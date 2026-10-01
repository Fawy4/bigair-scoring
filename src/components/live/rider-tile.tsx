import { Lock } from "lucide-react";
import { RiderLabel } from "@/components/rider-label";
import type { LabelModel } from "@/lib/identification/rider-label";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

/**
 * A rider in the strip: the stripe and dot in the Lycra colour, the colour word in ink, the "n / max" counter, an accent border when selected, and the
 * dashed "Out of attempts" state (docs/06 §5). `compact` is the 3 to 4 across strip of the judge and spotter screens; otherwise the full Rider label.
 */
export function RiderTile({
  label,
  attempts,
  max,
  selected = false,
  onSelect,
  compact = false,
  counterText,
  photoUrl,
  photoName,
}: {
  label: LabelModel;
  attempts: number;
  max: number | null;
  selected?: boolean;
  onSelect?: () => void;
  compact?: boolean;
  /** Replaces the "n / max" counter (the heat-end strip shows the score given instead). */
  counterText?: string;
  photoUrl?: string | null;
  photoName?: string;
}) {
  const out = max !== null && attempts >= max;
  const T = copy.live.tile;
  const p = label.primary;
  const counter = max === null ? `${attempts}` : out ? T.outOfAttempts(attempts, max) : T.counter(attempts, max);
  const frame = cn(
    "relative w-full min-w-0 rounded-card text-left",
    out ? "border border-dashed border-beach-missing bg-beach-surface" : selected ? "border-2 border-beach-accent bg-beach-bg" : "border border-beach-line bg-beach-bg",
  );
  return (
    <button type="button" data-testid="rider-tile" data-selected={selected} data-out={out} aria-pressed={selected} disabled={out} onClick={onSelect} className={cn(frame, compact ? "min-h-[64px] px-1 py-1" : "min-h-[64px] px-3 py-2")}>
      {compact ? (
        <span className="flex min-w-0 items-stretch gap-1">
          <span aria-hidden className="w-1 shrink-0 rounded-full" style={{ backgroundColor: p.hex ?? "var(--beach-border)", boxShadow: p.outlined && p.hex ? "inset 0 0 0 1px var(--beach-ink)" : undefined }} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span data-testid="rider-tile-word" className={cn("truncate text-small font-semibold leading-tight", out ? "text-beach-missing" : "text-beach-ink")}>
              {p.text}
            </span>
            <span className="flex items-center gap-1">
              {p.kind === "colour" ? <span aria-hidden className="size-4 shrink-0 rounded-full" style={{ backgroundColor: p.hex, boxShadow: p.outlined ? "inset 0 0 0 1.5px var(--beach-ink)" : undefined }} /> : null}
              <span data-testid="rider-tile-counter" className={cn("text-small font-medium leading-tight", out ? "text-beach-missing" : "text-beach-muted")}>
                {counterText ?? (max === null ? attempts : `${attempts} / ${max}`)}
              </span>
            </span>
            {out ? (
              <span className="flex items-center gap-1 text-small font-semibold leading-tight text-beach-missing">
                <Lock aria-hidden className="size-3.5" />
                {T.outWord}
              </span>
            ) : null}
          </span>
        </span>
      ) : (
        <span className="flex w-full items-center gap-3">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- the rider's own photo from registration
            <img src={photoUrl} alt={T.photo(photoName ?? "")} className="size-12 shrink-0 rounded-full border border-beach-line object-cover" />
          ) : null}
          <span className={cn("min-w-0 flex-1", out && "grayscale")}>
            <RiderLabel model={label} variant="stripe" bare />
          </span>
          <span data-testid="rider-tile-counter" className={cn("flex shrink-0 items-center gap-1 text-small font-semibold", out ? "text-beach-missing" : "text-beach-ink")}>
            {out ? <Lock aria-hidden className="size-4" /> : null}
            {counter}
          </span>
        </span>
      )}
    </button>
  );
}
