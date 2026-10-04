"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { foldInitial, foldKey, foldSaved } from "@/lib/org/fold-state";
import { cn } from "@/lib/utils";

/**
 * A section card whose header folds and unfolds it (Polish 3, item 11). Pure layout: what is inside is rendered all the time (a folded card is only hidden), so a value
 * typed in a card is still there when it is unfolded. The first card of a page starts open and the others folded; the choice is remembered in this browser (inside
 * try/catch); a card that holds a validation error unfolds itself when the error appears.
 */
export function FoldCard({ id, title, first = false, className, titleClassName, testId, children }: { id: string; title: string; first?: boolean; className?: string; titleClassName?: string; testId?: string; children: ReactNode }) {
  const [open, setOpen] = useState(first);
  const body = useRef<HTMLDivElement>(null);
  const bodyId = useId();

  useEffect(() => {
    try {
      setOpen(foldInitial(foldSaved(window.localStorage.getItem(foldKey(id))), first));
    } catch {
      /* storage not available: the default stands */
    }
  }, [id, first]);

  // an error inside the card (a message under a field, a field marked invalid) opens it; it is not written to the memory
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const look = () => {
      if (el.querySelector('.field-error, [role="alert"], [aria-invalid="true"]')) setOpen(true);
    };
    look();
    const watch = new MutationObserver(look);
    watch.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-invalid"] });
    return () => watch.disconnect();
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(foldKey(id), next ? "open" : "closed");
    } catch {
      /* not remembered; still works until the page closes */
    }
  };

  return (
    <section data-testid={testId} data-fold={open ? "open" : "closed"} aria-label={title} className={className}>
      <h3 className={cn("m-0", titleClassName)}>
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls={bodyId} data-testid={`fold-${id}`} className="flex min-h-[var(--org-ctl)] w-full items-center justify-between gap-2 text-left font-semibold">
          <span>{title}</span>
          <ChevronDown aria-hidden className={cn("size-4 shrink-0 transition-transform", open ? "rotate-180" : "")} />
        </button>
      </h3>
      <div id={bodyId} ref={body} hidden={!open} className={open ? "flex flex-col gap-3" : "hidden"}>
        {children}
      </div>
    </section>
  );
}
