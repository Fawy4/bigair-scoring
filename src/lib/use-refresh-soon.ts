"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * "Refresh the page in the background, soon": for a screen that already shows what it just saved and only needs the page around it (the left rail's pills, the other
 * steps) to catch up. The refresh waits for a quiet moment instead of starting at once, because the app queues the next save behind a refresh that is on its way:
 * two saves a second apart would otherwise make the second wait for the page to be drawn again. A newer call replaces the one waiting; leaving the screen cancels it
 * (the next screen is drawn fresh anyway).
 */
export function useRefreshSoon(delayMs = 1500): () => void {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      router.refresh();
    }, delayMs);
  }, [router, delayMs]);
}
