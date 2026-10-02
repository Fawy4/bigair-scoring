"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";
import { simLeaveHref, SIM_VIEW_BEAT_MS } from "@/lib/simulator/view-hold";

/**
 * While a seat's page is open the phone says "I am here" every 30 seconds (the organiser sees it as "last seen").
 * On a simulation event (`simEventId`) the tab also tells the simulator every few seconds that a View-as seat is still in use, even in the background, and
 * says "I am leaving" when it closes, so the simulator takes the seat back within seconds (Polish 2, item 2). For a phone that joined with a PIN both calls do nothing.
 */
export function SeatHeartbeat({ simEventId }: { simEventId?: string } = {}) {
  useEffect(() => {
    const supabase = createClient();
    const beat = () => {
      if (document.visibilityState === "visible") void Promise.resolve(supabase.rpc("touch_seat")).catch(() => {}); // awaited, or the call is never sent
    };
    beat();
    const t = setInterval(beat, 30_000);
    document.addEventListener("visibilitychange", beat);
    let simTimer: ReturnType<typeof setInterval> | null = null;
    const simBeat = () => void Promise.resolve(supabase.rpc("sim_view_beat", { p_event: simEventId! })).catch(() => {});
    const leave = () => {
      try {
        navigator.sendBeacon(simLeaveHref(simEventId!));
      } catch {
        // the simulator takes the seat back after 90 silent seconds anyway
      }
    };
    if (simEventId) {
      simBeat();
      simTimer = setInterval(simBeat, SIM_VIEW_BEAT_MS);
      window.addEventListener("pagehide", leave);
    }
    return () => {
      clearInterval(t);
      if (simTimer) clearInterval(simTimer);
      document.removeEventListener("visibilitychange", beat);
      if (simEventId) window.removeEventListener("pagehide", leave);
    };
  }, [simEventId]);
  return null;
}
