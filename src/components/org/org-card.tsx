import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A card of the organiser screens: a 1 px soft line, 12 px corners, a 14 px title and nothing decorative. */
export function OrgCard({ title, actions, children, className, testId }: { title: string; actions?: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section data-testid={testId} aria-label={title} className={cn("rounded-card border border-beach-line bg-beach-bg", className)}>
      <header className="flex items-center justify-between gap-2 border-b border-beach-line px-4 py-2">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        {actions}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
