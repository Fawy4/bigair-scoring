import { Check } from "lucide-react";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

/** The persistent confirmation that stays until the next action: "Saved 7.5 — RED — attempt 4" (docs/06 §00.6). One slim line, never a toast. */
export function SavedBanner({ message, className }: { message: string | null; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="saved-banner"
      className={cn(
        "flex min-h-[36px] items-center gap-2 rounded-xl border px-3 py-1 text-body font-semibold",
        message ? "border-beach-live bg-beach-bg text-beach-ink" : "border-dashed border-beach-line bg-beach-bg text-beach-muted",
        className,
      )}
    >
      {message ? <Check aria-hidden className="size-5 shrink-0 text-beach-live" /> : null}
      <span className="min-w-0 truncate">{message ?? copy.live.saved.waiting}</span>
    </div>
  );
}
