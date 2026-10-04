"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { copy } from "@/lib/ui-copy";

/** The calm page for a busy moment (the safety valve): says so and asks again by itself every few seconds. Nothing here is an error. */
export function Updating({ retrySec = 4 }: { retrySec?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), retrySec * 1000);
    return () => clearInterval(id);
  }, [router, retrySec]);
  const U = copy.pub.updating;
  return (
    <div data-testid={U.testId} role="status" className="beach-day beach-text-normal flex min-h-screen flex-col items-center justify-center gap-2 bg-beach-bg px-6 text-center text-beach-ink">
      <p className="text-heading font-semibold">{U.title}</p>
      <p className="max-w-sm text-body font-medium text-beach-muted">{U.body}</p>
    </div>
  );
}
