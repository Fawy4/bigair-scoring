"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { copy } from "@/lib/ui-copy";

const T = copy.riders.links;

/** The "Name — address" lines, ready to paste into a WhatsApp group: shown in a box and copied with one tap. */
export function LinksText({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <section className="no-print flex flex-col gap-2" aria-label={T.textHeading}>
      <h2>{T.textHeading}</h2>
      <p className="max-w-[70ch] text-body font-medium text-beach-muted">{T.textHelp}</p>
      <textarea readOnly data-testid="rider-links-text" value={text} rows={Math.min(14, Math.max(4, text.split("\n").length))} className="w-full" />
      <div>
        <button
          type="button"
          data-testid="rider-links-copy"
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
            } catch {
              const field = document.querySelector<HTMLTextAreaElement>('[data-testid="rider-links-text"]');
              field?.select();
              document.execCommand("copy");
            }
            setDone(true);
            setTimeout(() => setDone(false), 2500);
          }}
        >
          {done ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          {done ? T.copied : T.copy}
        </button>
      </div>
    </section>
  );
}
