"use client";

import { useEffect, useState } from "react";
import { utcToLocalHHMM } from "@/lib/engine/schedule";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

/**
 * The time now, small and muted, "14:05" in the event's time zone, never the device's.
 * Screens that already run a server clock pass `nowMs` (server milliseconds); a page rendered on the server passes `serverNow` (the ISO time the server had when it
 * rendered), and the clock keeps its own offset from this phone's clock, so a phone with the wrong time still shows the right one. Minutes only: it redraws every 10 seconds.
 */
export function ClockText({ timezone, nowMs, serverNow, className }: { timezone: string; nowMs?: number; serverNow?: string; className?: string }) {
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (serverNow) setOffset(Date.parse(serverNow) - Date.now());
  }, [serverNow]);
  useEffect(() => {
    if (nowMs !== undefined) return;
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, [nowMs]);
  void tick;
  const ms = nowMs ?? (serverNow ? Date.now() + offset : Date.now());
  const hhmm = utcToLocalHHMM(ms, timezone);
  return (
    <time data-testid="now-clock" dateTime={new Date(ms).toISOString()} aria-label={copy.clock.label(hhmm)} suppressHydrationWarning className={cn("text-small font-medium tabular-nums text-beach-muted", className)}>
      {hhmm}
    </time>
  );
}
