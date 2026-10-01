"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** "Copy link": the page's address to the clipboard, with a word to confirm (never colour alone). */
export function CopyLink({ url, label, doneLabel }: { url: string; label: string; doneLabel: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      data-testid="copy-link"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          const field = document.createElement("textarea");
          field.value = url;
          document.body.appendChild(field);
          field.select();
          document.execCommand("copy");
          field.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 2500);
      }}
      className="inline-flex min-h-tap items-center gap-1.5 rounded-xl border border-beach-border bg-beach-bg px-3 text-body font-semibold text-beach-ink"
    >
      {done ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
      {done ? doneLabel : label}
    </button>
  );
}
