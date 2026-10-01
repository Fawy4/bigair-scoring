import Link from "next/link";
import { cn } from "@/lib/utils";

/** A row of links that look like tabs: plain links (no script), the current one marked. */
export function ChipLinks({ items, label, testId }: { items: Array<{ href: string; label: string; current: boolean; testId?: string }>; label: string; testId?: string }) {
  return (
    <nav aria-label={label} data-testid={testId} className="-mx-3 overflow-x-auto px-3">
      <ul className="flex min-w-max gap-1.5 pb-1" role="list">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              prefetch={false}
              data-testid={i.testId}
              aria-current={i.current ? "true" : undefined}
              className={cn("inline-flex min-h-[36px] items-center rounded-xl border px-3 text-body font-semibold", i.current ? "border-beach-accent bg-beach-accent text-beach-on-accent" : "border-beach-line bg-beach-surface text-beach-ink")}
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
