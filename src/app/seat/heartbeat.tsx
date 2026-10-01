"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";

/** While a seat's page is open the phone says "I am here" every 30 seconds (the organiser sees it as "last seen"). */
export function SeatHeartbeat() {
  useEffect(() => {
    const supabase = createClient();
    const beat = () => {
      if (document.visibilityState === "visible") void Promise.resolve(supabase.rpc("touch_seat")).catch(() => {}); // awaited, or the call is never sent
    };
    beat();
    const t = setInterval(beat, 30_000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);
  return null;
}
