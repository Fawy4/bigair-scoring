"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * The public pages poll: every few seconds (the event's "live update" setting) the page asks the server for fresh data and swaps it in. It does nothing while the
 * page is hidden (saves battery and data) and refreshes at once when the page comes back. No realtime connection, no login.
 */
export function LivePoll({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const every = Math.max(3, seconds) * 1000;
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, every);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("online", tick);
    };
  }, [router, seconds]);
  return null;
}
