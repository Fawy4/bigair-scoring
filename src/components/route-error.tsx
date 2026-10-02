"use client";

import Link from "next/link";
import { useEffect } from "react";
import { copy } from "@/lib/ui-copy";

const C = copy.crash;

/**
 * What an `error.tsx` file shows when a whole page fails: a readable page with a one-line reason and a way back, never a blank "Application error".
 * Next keeps the surrounding layout (header, step list) alive, so the organiser can still move to another step.
 */
export function RouteError({ error, reset, area, back }: { error: Error & { digest?: string }; reset: () => void; area: string; back: { href: string; label: string } }) {
  useEffect(() => {
    console.error(`[${area}] page error`, error);
  }, [error, area]);
  return (
    <main role="alert" data-testid="route-error" className="m-3 flex max-w-2xl flex-col gap-3 rounded-xl border border-beach-line bg-beach-bg p-4 text-beach-ink">
      <h1 className="text-2xl font-semibold">{C.heading}</h1>
      <p className="text-lg font-semibold">{C.text}</p>
      <p className="text-lg font-semibold" data-testid="route-error-reason">
        {error.digest ? C.reference(error.digest) : C.reason(error.message || "unknown")}
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={reset} className="min-h-[56px] rounded-xl border border-beach-line bg-beach-ink px-5 text-lg font-semibold text-beach-on-accent">
          {C.retry}
        </button>
        <Link href={back.href} className="flex min-h-[56px] items-center rounded-xl border border-beach-line px-5 text-lg font-semibold">
          {back.label}
        </Link>
      </div>
    </main>
  );
}
