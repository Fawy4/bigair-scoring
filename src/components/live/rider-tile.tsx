import { Check, Lock } from "lucide-react";
import { RiderLabel } from "@/components/rider-label";
import type { LabelModel } from "@/lib/identification/rider-label";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

/**
 * A rider on the spotter and judge strips: the shared Rider label, the "n / max" counter, a thick border when selected,
 * and the grey "Out of attempts · 7 / 7" state (docs/06 §5). Tapping selects (or, for a judge, adds an attempt when the event allows it).
 */
export function RiderTile({
  label,
  attempts,
  max,
  selected = false,
  onSelect,
  photoUrl,
  photoName,
}: {
  label: LabelModel;
  attempts: number;
  max: number | null;
  selected?: boolean;
  onSelect?: () => void;
  photoUrl?: string | null;
  photoName?: string;
}) {
  const out = max !== null && attempts >= max;
  const T = copy.live.tile;
  return (
    <button
      type="button"
      data-testid="rider-tile"
      data-selected={selected}
      data-out={out}
      aria-pressed={selected}
      disabled={out}
      onClick={onSelect}
      className={cn(
        "flex min-h-[5rem] w-full flex-col items-start gap-2 rounded-lg p-3 text-left",
        out ? "border-4 border-dashed border-beach-missing bg-beach-surface text-beach-missing" : selected ? "border-4 border-beach-selected bg-beach-surface text-beach-ink" : "border-4 border-beach-border bg-beach-bg text-beach-ink",
      )}
    >
      <span className="flex w-full items-center gap-3">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- the rider's own photo from registration
          <img src={photoUrl} alt={T.photo(photoName ?? "")} className="size-14 shrink-0 rounded-full border-2 border-beach-border object-cover" />
        ) : null}
        <span className={cn(out && "grayscale")}>
          <RiderLabel model={label} size="md" nameplate />
        </span>
      </span>
      <span className="flex w-full flex-wrap items-center justify-between gap-2 text-xl font-extrabold">
        <span data-testid="rider-tile-counter" className="inline-flex items-center gap-2">
          {out ? <Lock aria-hidden className="size-6" /> : null}
          {max === null ? `${attempts}` : out ? T.outOfAttempts(attempts, max) : T.counter(attempts, max)}
        </span>
        {selected && !out ? (
          <span className="inline-flex items-center gap-1 text-beach-selected">
            <Check aria-hidden className="size-6" />
            {T.selected}
          </span>
        ) : null}
      </span>
    </button>
  );
}
