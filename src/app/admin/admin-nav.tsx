"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { copy } from "@/lib/ui-copy";

const ITEMS = [
  { href: "/admin", label: copy.admin.nav.organisations, match: (p: string) => p === "/admin" || p.startsWith("/admin/organisations") },
  { href: "/admin/settings", label: copy.admin.nav.settings, match: (p: string) => p.startsWith("/admin/settings") },
  { href: "/admin/presets", label: copy.admin.nav.presets, match: (p: string) => p.startsWith("/admin/presets") },
  { href: "/admin/tricks", label: copy.admin.nav.tricks, match: (p: string) => p.startsWith("/admin/tricks") },
  { href: "/admin/feedback", label: copy.admin.nav.feedback, match: (p: string) => p.startsWith("/admin/feedback") },
  { href: "/admin/audit", label: copy.admin.nav.audit, match: (p: string) => p.startsWith("/admin/audit") },
  { href: "/admin/health", label: copy.admin.nav.health, match: (p: string) => p.startsWith("/admin/health") },
];

/** The current page is shown with a heavy border and aria-current, never colour alone. */
export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label={copy.admin.navLabel} className="flex flex-wrap items-center gap-2">
      {ITEMS.map((i) => {
        const here = i.match(path);
        return (
          <Link key={i.href} href={i.href} className={`btn ${here ? "!border-4 font-extrabold" : ""}`} aria-current={here ? "page" : undefined}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
