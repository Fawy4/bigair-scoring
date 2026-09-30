"use client";

import { useId, useState } from "react";
import { copy, type Help } from "@/lib/ui-copy";

/** A "?" that opens a one-sentence explanation with an example. A tap, never a long-press (beach rule 00.3). */
export function HelpButton({ what, help }: { what: string; help: Help }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="inline-flex flex-col">
      <button type="button" className="help-btn" aria-label={copy.common.helpLabel(what)} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {copy.common.helpButton}
      </button>
      {open ? (
        <span id={id} role="note" className="help-note">
          {help.text}
          {help.example ? (
            <>
              {" "}
              <strong>{copy.common.example}</strong> {help.example}
            </>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

/** A form label with its "?" next to it. The explanation opens under the label, full width. */
export function FieldLabel({ htmlFor, text, help, as = "label" }: { htmlFor?: string; text: string; help?: Help; as?: "label" | "span" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <span className="flex items-start gap-2">
        {as === "label" ? <label htmlFor={htmlFor}>{text}</label> : <span className="text-base font-bold">{text}</span>}
        {help ? (
          <button type="button" className="help-btn" aria-label={copy.common.helpLabel(text)} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
            {copy.common.helpButton}
          </button>
        ) : null}
      </span>
      {open && help ? (
        <span id={id} role="note" className="help-note">
          {help.text}
          {help.example ? (
            <>
              {" "}
              <strong>{copy.common.example}</strong> {help.example}
            </>
          ) : null}
        </span>
      ) : null}
    </>
  );
}
