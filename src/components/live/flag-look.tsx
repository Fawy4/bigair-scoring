import { Flag } from "lucide-react";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

/**
 * A judge's flag has a look of its own (HE1): the brand's own near-black on white (white on near-black in Dark), filled and with a flag icon, so it is never mistaken for the
 * amber of an outlier score or the yellow of the flag strip. Words and an icon, never colour alone. No new colour: only the brand's ink and ground.
 */
export const FLAG_LOOK = "border-2 border-beach-ink bg-beach-ink text-beach-bg";

/** "1 open flag" / "3 open flags", beside the heat header on the laptop console and on the phone. Nothing when no flag is open. */
export function OpenFlagCount({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span data-testid="open-flag-count" data-count={n} role="status" className={cn("inline-flex min-h-[28px] items-center gap-1 rounded-full px-2.5 text-small font-bold", FLAG_LOOK, className)}>
      <Flag aria-hidden className="size-4 shrink-0" />
      {copy.heatEnd.openFlags(n)}
    </span>
  );
}
