"use client";

import { useId, useState } from "react";
import { copy } from "@/lib/ui-copy";

/** A "?" that opens one sentence (and an example). A tap, never a long-press (docs/06 §00.3). */
export function HelpTip({ what, text }: { what: string; text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        aria-label={copy.live.criteria.help(what)}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-full border-2 border-beach-border bg-beach-bg text-xl font-extrabold text-beach-ink aria-expanded:bg-beach-selected aria-expanded:text-beach-on-selected"
      >
        {copy.common.helpButton}
      </button>
      {open ? (
        <span id={id} role="note" className="mt-2 block w-full max-w-prose rounded-md border-l-8 border-beach-border bg-beach-surface p-3 text-lg font-semibold text-beach-ink">
          {text}
        </span>
      ) : null}
    </span>
  );
}
