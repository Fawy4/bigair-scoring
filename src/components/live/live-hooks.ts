"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beep } from "@/lib/live/beep";
import { timerCues } from "@/lib/live/timer-cues";
import { holdScreenAwake } from "@/lib/live/wake-lock";
import { useObserving } from "./read-only";

/** The phone's own idea of "online", from the browser. */
export function useOnline(): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(navigator.onLine);
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return on;
}

/** One beep (and a vibration) at 1:00 and two at 0:00, only when the person switched Sound on, and never while paused. */
export function useTimerSound(remainingMs: number, running: boolean, soundOn: boolean): void {
  const prev = useRef<number | null>(null);
  useEffect(() => {
    const cue = timerCues(prev.current, remainingMs, !running);
    prev.current = running ? remainingMs : null;
    if (cue && soundOn) beep(cue === "time_up" ? 2 : 1);
  }, [remainingMs, running, soundOn]);
}

/** Keeps the screen awake while `active` (a heat is running). */
export function useWakeLock(active: boolean): void {
  useEffect(() => (active ? holdScreenAwake() : undefined), [active]);
}

/**
 * When the clock reaches zero every official phone asks the database to end the heat (`end_heat_if_due`). It only does so when the time is really up and
 * a second call changes nothing, so "end at zero" needs no cron job and no trusted phone. Tries again every 3 seconds until the heat has ended.
 */
export function useEndAtZero(supabase: SupabaseClient, heatId: string | null, timeUp: boolean, status: string | undefined, enabled = true): void {
  const observing = useObserving(); // an observed screen never asks (the database would refuse an observer anyway)
  useEffect(() => {
    if (observing || !enabled || !heatId || !timeUp || status !== "running") return;
    // a Supabase call only goes out when it is awaited (or .then is called), so `void` would send nothing
    const call = () => void Promise.resolve(supabase.rpc("end_heat_if_due", { p_heat: heatId })).catch(() => {});
    call();
    const t = setInterval(call, 3000);
    return () => clearInterval(t);
  }, [supabase, heatId, timeUp, status, enabled, observing]);
}
