"use client";

import { useId, useState } from "react";
import { copy } from "@/lib/ui-copy";
import { LearnMore } from "@/components/manual/learn-more";
import { settingHref } from "@/lib/manual/settings-lookup";

/** A "?" that opens one sentence (and an example). A tap, never a long-press (docs/06 §00.3). */
/** `learnMore`: on an organiser screen (the simulator) the note also links to the manual. */
export function HelpTip({ what, text, learnMore = false }: { what: string; text: string; learnMore?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        aria-label={copy.live.criteria.help(what)}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-full border border-beach-border bg-beach-bg text-body font-semibold text-beach-ink aria-expanded:bg-beach-accent aria-expanded:text-beach-on-accent"
      >
        {copy.common.helpButton}
      </button>
      {open ? (
        <span id={id} role="note" className="mt-2 block w-full rounded-xl border border-beach-line bg-beach-surface p-3 text-body font-medium text-beach-ink">
          {text}
          {learnMore ? <LearnMore href={settingHref(text)} what={what} /> : null}
        </span>
      ) : null}
    </span>
  );
}
