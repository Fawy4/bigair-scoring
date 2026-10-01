import { Lock } from "lucide-react";
import { RiderLabel } from "@/components/rider-label";
import { labelStyleOfPrimary } from "@/lib/identification/label-style";
import type { LabelModel } from "@/lib/identification/rider-label";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

/**
 * A rider card with the "n / max" counter and an accent border when selected. It follows the event's identification scheme and always shows the name
 * (owner, round 4). `compact` is the strip of 3 to 4 across: the main identifier in its style (colour block, number block, or the name), the name under it,
 * and the counter; otherwise the full Rider label beside the counter.
 * A rider who has used every attempt shows the dashed "Out of attempts" state. `lockWhenOut` (the spotter's strip, where Log is off for that rider) also
 * stops the tap; in the judge's Details view every rider stays tappable.
 */
export function RiderTile({
  label,
  attempts,
  max,
  selected = false,
  onSelect,
  compact = false,
  lockWhenOut = false,
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
  lockWhenOut?: boolean;
  /** Replaces the "n / max" counter (the heat-end strip shows the score given instead). */
  counterText?: string;
  photoUrl?: string | null;
  photoName?: string;
}) {
  const out = max !== null && attempts >= max;
  const T = copy.live.tile;
  const p = label.primary;
  const style = labelStyleOfPrimary(p);
  const name = style === "name-first" ? null : label.secondary.find((x) => x.key === "name")?.text;
  const counter = max === null ? `${attempts}` : out ? T.outOfAttempts(attempts, max) : T.counter(attempts, max);
  const frame = cn(
    "relative w-full min-w-0 rounded-card text-left",
    out ? "border border-dashed border-beach-missing bg-beach-surface" : selected ? "border-2 border-beach-accent bg-beach-bg" : "border border-beach-line bg-beach-bg",
  );
  return (
    <button type="button" data-testid="rider-tile" data-selected={selected} data-out={out} aria-pressed={selected} disabled={out && lockWhenOut} onClick={onSelect} className={cn(frame, compact ? "p-1" : "min-h-row px-2 py-1")}>
      {compact ? (
        <span className="flex min-w-0 flex-col items-stretch gap-px">
          {style === "colour-block" ? (
            <span data-testid="rider-tile-word" className="truncate rounded px-1 text-center text-small font-semibold leading-tight tracking-wide" style={{ backgroundColor: p.hex, color: p.ink, boxShadow: p.outlined ? "inset 0 0 0 1.5px var(--beach-ink)" : undefined }}>
              {p.text}
            </span>
          ) : (
            <span data-testid="rider-tile-word" className={cn("truncate text-small font-semibold leading-tight text-beach-ink", style === "number-block" && "rounded border-2 border-beach-ink bg-beach-surface px-1 text-center")}>
              {p.text}
            </span>
          )}
          {name ? (
            <span data-testid="rider-tile-name" className="truncate text-small font-medium leading-tight text-beach-ink">
              {name}
            </span>
          ) : null}
          <span data-testid="rider-tile-counter" className={cn("flex items-center gap-1 text-small font-medium leading-tight", out ? "text-beach-missing" : "text-beach-muted")}>
            {out ? <Lock aria-hidden className="size-3" /> : null}
            {counterText ?? (max === null ? attempts : out ? `${attempts} / ${max} ${T.outWord}` : `${attempts} / ${max}`)}
          </span>
        </span>
      ) : (
        <span className="flex w-full items-center gap-2">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- the rider's own photo from registration
            <img src={photoUrl} alt={T.photo(photoName ?? "")} className="size-9 shrink-0 rounded-full border border-beach-line object-cover" />
          ) : null}
          <span className={cn("min-w-0 flex-1", out && "grayscale")}>
            <RiderLabel model={label} variant="live" bare />
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
