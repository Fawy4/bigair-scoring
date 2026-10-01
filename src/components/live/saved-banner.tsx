import { Check } from "lucide-react";
import { copy } from "@/lib/ui-copy";

/** The large confirmation that stays until the next action: "Saved 7.5 — RED — attempt 4" (docs/06 §00.6). Never a toast. */
export function SavedBanner({ message }: { message: string | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="saved-banner"
      className={
        message
          ? "flex min-h-[4rem] items-center gap-3 rounded-lg border-4 border-beach-live bg-beach-surface px-4 py-2 text-xl font-extrabold text-beach-live"
          : "flex min-h-[4rem] items-center gap-3 rounded-lg border-4 border-dashed border-beach-missing bg-beach-surface px-4 py-2 text-xl font-bold text-beach-missing"
      }
    >
      {message ? <Check aria-hidden className="size-8 shrink-0" /> : null}
      <span>{message ?? copy.live.saved.waiting}</span>
    </div>
  );
}
