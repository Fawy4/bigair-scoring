import { Check } from "lucide-react";
import { RiderLabel } from "@/components/rider-label";
import { labelStyleOfPrimary } from "@/lib/identification/label-style";
import type { LabelModel } from "@/lib/identification/rider-label";
import { riderBarStyle } from "@/lib/live/rider-bar";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

/**
 * A rider's selectable bar on the Impression / Variety step (the head judge's sheet, the judge's phone). With a Lycra (or rash guard, helmet) scheme the bar is filled in the rider's
 * colour with the colour word on it in an ink that reads at 7:1 (a plain plate under the word when the colour alone cannot give that), then the name and nationality the scheme lists;
 * with any other scheme it is the shared Rider label on a plain bar. The selected bar has a thick border and a tick, never colour alone. `compact` stacks the parts (the phone's strip
 * of 3 to 5 across); otherwise they sit on one line with the score at the end.
 */
export function RiderBar({
  label,
  selected,
  onSelect,
  scoreText,
  compact = false,
  testId,
  extra,
  ...rest
}: {
  label: LabelModel;
  selected: boolean;
  onSelect: () => void;
  /** The score now, "—" or Absent. */
  scoreText: string;
  compact?: boolean;
  testId: string;
  extra?: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "className" | "type">) {
  const p = label.primary;
  const coloured = labelStyleOfPrimary(p) === "colour-block" && Boolean(p.hex);
  const bar = coloured ? riderBarStyle(p.hex!) : null;
  const name = label.secondary.find((x) => x.key === "name")?.text ?? "";
  const others = label.secondary.filter((x) => x.key !== "name").map((x) => x.text).join(" · ");
  // text beside the word sits on a plain plate of the page's own colours (Day and Dark), so it reads whatever the Lycra is
  const plain = "rounded bg-beach-bg px-1 text-beach-ink";
  return (
    <button
      type="button"
      data-testid={testId}
      data-selected={selected}
      data-bar={coloured ? "lycra" : "plain"}
      data-fill={bar?.fill}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn("relative w-full min-w-0 rounded-card text-left", selected ? "border-4 border-beach-ink" : "border border-beach-line", coloured ? "" : "bg-beach-bg", compact ? "p-1" : "min-h-row px-2 py-1")}
      style={bar ? { backgroundColor: bar.fill } : undefined}
      {...rest}
    >
      {coloured && bar ? (
        <span className={cn("flex min-w-0 items-center gap-1.5", compact && "flex-col items-stretch gap-0.5")}>
          <span className={cn("flex min-w-0 items-center gap-1", compact && "justify-center")}>
            {selected ? <Check data-testid="rider-bar-tick" aria-label={copy.live.impression.riderSelected} className="size-4 shrink-0" style={{ color: bar.plate ? "#ffffff" : bar.wordInk }} strokeWidth={4} /> : null}
            <span data-testid="rider-bar-word" className="truncate rounded px-1.5 text-small font-bold leading-tight tracking-wide" style={{ color: bar.wordInk, backgroundColor: bar.wordBg }}>
              {p.text}
            </span>
          </span>
          <span className={cn("flex min-w-0 flex-1", compact ? "flex-col gap-0.5" : "items-baseline gap-1.5")}>
            <span data-testid="rider-bar-name" className={cn("truncate text-small font-semibold leading-tight", plain)}>
              {name}
            </span>
            {others ? (
              <span data-testid="rider-bar-rest" className={cn("truncate text-small font-medium leading-tight", plain)}>
                {others}
              </span>
            ) : null}
          </span>
          <span data-testid="rider-bar-score" className={cn("shrink-0 text-small font-semibold tabular-nums", plain, compact && "text-center")}>
            {scoreText}
          </span>
        </span>
      ) : (
        <span className={cn("flex min-w-0 items-center gap-1.5", compact && "flex-col items-stretch gap-0.5")}>
          {selected ? <Check data-testid="rider-bar-tick" aria-label={copy.live.impression.riderSelected} className="size-4 shrink-0 text-beach-ink" strokeWidth={4} /> : null}
          <span className="min-w-0 flex-1">
            <RiderLabel model={label} variant="live" bare />
          </span>
          <span data-testid="rider-bar-score" className={cn("shrink-0 text-small font-semibold tabular-nums text-beach-ink", compact && "text-center")}>
            {scoreText}
          </span>
        </span>
      )}
      {extra}
    </button>
  );
}
