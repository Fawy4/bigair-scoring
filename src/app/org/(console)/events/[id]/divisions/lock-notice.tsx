"use client";

import { useId, useState } from "react";
import { Lock } from "lucide-react";
import { Pill } from "@/components/live/pill";
import { copy } from "@/lib/ui-copy";

/** The rules lock as one small pill with a "?": the sentence opens on a tap. */
export function LockNotice() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="flex flex-col items-start">
      <div className="flex items-center">
        <Pill icon={Lock} tone="ink">
          {copy.divisions.lockPill}
        </Pill>
        <button type="button" aria-label={copy.divisions.lockHelpLabel} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((o) => !o)} className="group inline-flex size-[var(--org-ctl)] items-center justify-center">
          <span className="inline-flex size-6 items-center justify-center rounded-full border border-beach-border bg-beach-bg text-small font-semibold group-aria-expanded:border-beach-accent group-aria-expanded:bg-beach-accent group-aria-expanded:text-beach-on-accent">?</span>
        </button>
      </div>
      {open ? (
        <p id={id} role="note" data-testid="lock-banner" className="rounded-[8px] border border-beach-line bg-beach-surface px-3 py-2 text-body font-medium">
          {copy.divisions.lockBanner}
        </p>
      ) : null}
    </div>
  );
}
