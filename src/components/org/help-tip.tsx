"use client";

import { useId, useState } from "react";
import { orgCopy } from "@/lib/ui-copy";
import { LearnMore } from "@/components/manual/learn-more";
import { settingHref } from "@/lib/manual/settings-lookup";

/** A “?” that opens one sentence and an example under it, for a label that is not a SettingRow (a ladder card, a table heading). A tap, never a long-press. */
export function HelpTip({ what, text, example }: { what: string; text: string; example?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="inline-flex flex-col">
      <button type="button" aria-label={orgCopy.settings.helpLabel(what)} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((o) => !o)} className="group inline-flex size-[var(--org-ctl)] items-center justify-center">
        <span className="inline-flex size-6 items-center justify-center rounded-full border border-beach-border bg-beach-bg text-small font-semibold group-aria-expanded:border-beach-accent group-aria-expanded:bg-beach-accent group-aria-expanded:text-beach-on-accent">?</span>
      </button>
      {open ? (
        <span id={id} role="note" data-testid="setting-example" className="mb-1 rounded-[8px] border border-beach-line bg-beach-surface px-3 py-2 text-body font-medium">
          {text}
          {example ? ` ${orgCopy.settings.example(example)}` : ""}
          <LearnMore href={settingHref(text)} what={what} />
        </span>
      ) : null}
    </span>
  );
}
