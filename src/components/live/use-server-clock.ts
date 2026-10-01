"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clockOffset } from "@/lib/live/timer";

/**
 * The server's time on this phone (docs/08 §1G-1). Asks the database for its clock a few times, keeps the answer that came back fastest, and asks again
 * every minute and whenever the page comes back. `now()` is the device clock plus the offset, so a phone whose clock is wrong still shows the right timer.
 */
export function useServerClock(supabase: SupabaseClient) {
  const offset = useRef(0);
  const [ready, setReady] = useState(false);
  const measure = useCallback(async () => {
    let best: { rtt: number; off: number } | null = null;
    for (let i = 0; i < 3; i++) {
      const sent = Date.now();
      try {
        const { data, error } = await supabase.rpc("server_now");
        const received = Date.now();
        if (error || !data) continue;
        const off = clockOffset(sent, Date.parse(data as string), received);
        if (!best || received - sent < best.rtt) best = { rtt: received - sent, off };
      } catch {
        /* offline: keep the last offset */
      }
    }
    if (best) {
      offset.current = best.off;
      setReady(true);
    }
  }, [supabase]);
  useEffect(() => {
    void measure();
    const t = setInterval(() => void measure(), 60_000);
    const onVisible = () => document.visibilityState === "visible" && void measure();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [measure]);
  const now = useCallback(() => Date.now() + offset.current, []);
  return { now, ready };
}

/** Re-renders every `ms` so a timer redraws; returns the server time of that moment. */
export function useTick(now: () => number, ms = 250): number {
  const [t, setT] = useState(() => now());
  useEffect(() => {
    const i = setInterval(() => setT(now()), ms);
    return () => clearInterval(i);
  }, [now, ms]);
  return t;
}
