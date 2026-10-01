"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
}

/** The page tabs of one event. Plain links (no prefetch, so a phone on mobile data does not download every page); the current one is marked. */
export function PublicNav({ items, label }: { items: NavItem[]; label: string }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="-mx-3 overflow-x-auto px-3">
      <ul className="flex min-w-max gap-1.5 pb-1">
        {items.map((i) => {
          const current = i.href === items[0].href ? path === i.href : path === i.href || path.startsWith(`${i.href}/`);
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                prefetch={false}
                aria-current={current ? "page" : undefined}
                className={cn("inline-flex min-h-tap items-center rounded-full border px-3 text-body font-semibold", current ? "border-beach-accent bg-beach-accent text-beach-on-accent" : "border-beach-line bg-beach-surface text-beach-ink")}
              >
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
