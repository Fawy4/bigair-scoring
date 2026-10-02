"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { copy } from "@/lib/ui-copy";

/** Inside a public event: this one page does not exist (an unknown rider, a leaderboard that is not there). The event itself is public, so the way out is back to the event. */
export function MissingPage() {
  // /e/<slug>/riders/<id> → /e/<slug>
  const eventHref = usePathname().split("/").slice(0, 3).join("/") || "/";
  return (
    <div className="flex flex-col gap-2 rounded-card border border-beach-line p-4" data-testid="missing-page">
      <h2 className="text-[16px] font-semibold">{copy.notFound.pageTitle}</h2>
      <p className="text-body font-medium text-beach-muted">{copy.notFound.pageBody}</p>
      <Link href={eventHref} className="inline-flex min-h-[var(--org-ctl)] w-fit items-center rounded-[8px] border border-beach-border px-3 text-body font-semibold">
        {copy.notFound.backToEvent}
      </Link>
    </div>
  );
}
