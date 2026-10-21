import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The "Heat ended" strip (HE1): its own full-width row at the top of an official's screen from the moment the clock reaches 0 or End heat is pressed, until the head judge
 * publishes. It says what the official can still do; the screen under it stays exactly as it was (nothing is taken away and nothing is locked). Words and an icon, never colour alone.
 */
export function HeatEndedStrip({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div data-testid="heat-ended-strip" role="status" className={cn("flex w-full shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-y border-beach-border bg-beach-surface px-2 py-1", className)}>
      <Clock aria-hidden className="size-4 shrink-0" />
      <p data-testid="heat-ended-text" className="min-w-0 flex-1 basis-40 whitespace-normal break-words text-body font-semibold leading-tight">
        {children}
      </p>
      {action ?? null}
    </div>
  );
}
