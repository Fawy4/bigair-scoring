"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "@/hooks/use-toast";
import type { Result } from "./actions";

/** Runs a server action, shows a small confirmation, keeps any error on screen until it is dismissed, and refreshes the page data. */
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run<T extends object>(action: () => Promise<Result<T>>, done?: string | ((r: { ok: true } & T) => string), then?: (r: { ok: true } & T) => void) {
    setError(null);
    start(async () => {
      const r = await action();
      if (r.ok) {
        const message = typeof done === "function" ? done(r) : done;
        if (message) toast({ title: message });
        then?.(r);
        router.refresh();
      } else setError(r.error);
    });
  }
  return { pending, error, setError, run };
}
