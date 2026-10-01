"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { orgCopy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface StepLink {
  label: string;
  onClick?: () => void;
  href?: string;
}

/** Previous and Next at the foot of a step. Go live has only Previous. On a phone it sticks to the bottom of the screen. */
export function StepFooter({ previous, next, sticky }: { previous?: StepLink; next?: StepLink; sticky?: boolean }) {
  return (
    <footer data-testid="step-footer" className={cn("flex items-center gap-2 border-t border-beach-line bg-beach-bg py-2 pl-4 pr-24", previous ? "justify-between" : "justify-end", sticky && "sticky bottom-0 z-20")}>
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
