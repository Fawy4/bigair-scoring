"use client";

import { useEffect, useState } from "react";
import { formatClock, remainingMs } from "@/lib/live/timer";

/**
 * Time left in the running heat (the words come from the server, so this file stays tiny). The server sends its own clock with the heat's start stamp, and every poll corrects it, so a phone whose own clock is wrong still
 * shows the right time. A paused heat stands still and says so.
 */
export function HeatClock({ startedAt, durationSec, pausedAt, pausedTotalSec, status, serverNow, className, leftWord, pausedWord }: { startedAt: string | null; durationSec: number; pausedAt: string | null; pausedTotalSec: number; status: string; serverNow: string; className?: string; leftWord: string; pausedWord: string }) {
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setOffset(Date.parse(serverNow) - Date.now());
  }, [serverNow]);
  useEffect(() => {
    if (status !== "running") return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [status]);
  void tick;
  const now = Date.now() + offset;
  const left = remainingMs({ status, durationSec, startedAt, pausedAt, pausedTotalSec }, status === "running" ? now : Date.parse(serverNow));
  return (
    <span data-testid="heat-clock" data-state={status} suppressHydrationWarning className={className}>
      {formatClock(left)} {leftWord}
      {status === "paused" ? ` · ${pausedWord}` : ""}
    </span>
  );
}
