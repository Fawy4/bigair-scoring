"use client";

import { useId, useState, type ReactNode } from "react";
import { orgCopy } from "@/lib/org-design/copy";
import { cn } from "@/lib/utils";
import { useShellLayout } from "./layout-context";

interface SettingRowProps {
  id: string;
  /** Plain label: what the setting is. */
  label: string;
  /** One line under the label: what it does. */
  explanation: string;
  /** The sentence the "?" opens: an example in real numbers. */
  example: string;
  /** The control (a NumberField, SelectField, Toggle …). */
  children: ReactNode;
}

/** Label, one line of explanation, a "?" that opens one example, and the control. On a laptop the control sits at the right; on a phone it goes under. */
export function SettingRow({ id, label, explanation, example, children }: SettingRowProps) {
  const [open, setOpen] = useState(false);
  const noteId = useId();
  const laptop = useShellLayout() === "laptop";
  return (
    <div data-testid={`setting-${id}`} className="border-b border-beach-line py-2 last:border-b-0">
      <div className={cn("flex gap-4", laptop ? "items-center justify-between" : "flex-col items-start gap-1")}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center">
            <span className="text-body font-semibold">{label}</span>
            <button
              type="button"
              aria-label={orgCopy.settings.helpLabel(label)}
              aria-expanded={open}
              aria-controls={open ? noteId : undefined}
              onClick={() => setOpen((o) => !o)}
              className="group inline-flex size-[var(--org-ctl)] items-center justify-center"
            >
              <span className="inline-flex size-6 items-center justify-center rounded-full border border-beach-border bg-beach-bg text-small font-semibold group-aria-expanded:border-beach-accent group-aria-expanded:bg-beach-accent group-aria-expanded:text-beach-on-accent">?</span>
            </button>
          </div>
          <p className="text-small font-medium text-beach-muted">{explanation}</p>
        </div>
        <div className="shrink-0">{children}</div>
      </div>
      {open ? (
        <p id={noteId} role="note" data-testid="setting-example" className="mt-1 rounded-[8px] border border-beach-line bg-beach-surface px-3 py-2 text-body font-medium">
          {orgCopy.settings.example(example)}
        </p>
      ) : null}
    </div>
  );
}
