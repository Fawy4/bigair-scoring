import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A section of the organiser screens (New look): a thin divider on top, a bold title and the content on the plain page. No box. */
export function OrgCard({ title, actions, children, className, testId }: { title: string; actions?: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section data-testid={testId} aria-label={title} className={cn("border-t border-beach-line bg-beach-bg", className)}>
      <header className="flex items-center justify-between gap-2 px-1 pt-3">
        <h3 className="text-[15px] font-bold">{title}</h3>
        {actions}
      </header>
      <div className="px-1 pb-4 pt-2">{children}</div>
    </section>
  );
}
