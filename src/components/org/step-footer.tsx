"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { orgCopy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface StepLink {
  label: string;
  onClick?: () => void;
  href?: string;
}

/** The height of the bar, published for the rest of the page: the page's bottom padding and the Note button sit on it (Polish 2, item 12). */
export const STEP_FOOTER_VAR = "--step-footer-h";

/**
 * Previous and Next at the foot of a step. Go live has only Previous. It sticks to the bottom of the screen on every size (Polish 2, item 12) and publishes its
 * height, so the page ends with room for it and the floating Note button sits above it instead of on it. Same tokens in Daylight and Dark.
 */
export function StepFooter({ previous, next, sticky = true }: { previous?: StepLink; next?: StepLink; sticky?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !sticky || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const set = () => root.style.setProperty(STEP_FOOTER_VAR, `${Math.ceil(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty(STEP_FOOTER_VAR);
    };
  }, [sticky]);
  return (
    <footer ref={ref} data-testid="step-footer" className={cn("flex items-center gap-2 border-t border-beach-line bg-beach-bg px-4 py-2 text-beach-ink", previous ? "justify-between" : "justify-end", sticky && "sticky bottom-0 z-20")}>
      {previous ? (
        <Button variant="secondary" icon={ArrowLeft} href={previous.href} onClick={previous.onClick}>
          {orgCopy.footer.previous(previous.label)}
        </Button>
      ) : null}
      {next ? (
        <Button variant="primary" icon={ArrowRight} href={next.href} onClick={next.onClick} className="flex-row-reverse">
          {orgCopy.footer.next(next.label)}
        </Button>
      ) : null}
    </footer>
  );
}
