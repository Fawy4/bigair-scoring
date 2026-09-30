"use client";

import Link from "next/link";
import { useEffect } from "react";
import { copy } from "@/lib/ui-copy";

/** Anything that still goes wrong in an admin page ends here: a readable page with an error reference, never a blank crash. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[admin] page error", error);
  }, [error]);
  const c = copy.admin.crash;
  return (
    <main role="alert" className="panel flex max-w-2xl flex-col gap-4">
      <h1 className="text-3xl font-extrabold">{c.heading}</h1>
      <p className="text-lg font-semibold">{c.text}</p>
      <p className="text-lg font-bold">{error.digest ? c.reference(error.digest) : c.noReference}</p>
      <p className="font-semibold">{c.hint}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" onClick={reset}>
          {c.retry}
        </button>
        <Link href="/admin/health" className="btn">
          {c.health}
        </Link>
        <Link href="/admin" className="btn">
          {c.back}
        </Link>
      </div>
    </main>
  );
}
