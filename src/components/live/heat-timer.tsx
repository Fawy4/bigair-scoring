import { Lock, Pause, Timer, Volume2, VolumeX } from "lucide-react";
import { Pill } from "./pill";
import { formatClock } from "@/lib/live/timer";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

export type TimerState = "running" | "paused" | "ended" | "held";

/**
 * The heat clock, and always a word for the state ("Paused", "Time up"), never colour alone.
 * "slim" (22 px) sits in the header of the judge and spotter screens; "head" (48 px) is for the head judge's console and the big screen.
 * It only draws what it is given; the clock maths (from the server's time) arrive in 5b.
 */
export function HeatTimer({ remainingMs, state, size = "slim", soundOn, onToggleSound }: { remainingMs: number; state: TimerState; size?: "slim" | "head"; soundOn?: boolean; onToggleSound?: () => void }) {
  const T = copy.live.timer;
  const word = { running: T.running, paused: T.paused, ended: T.ended, held: T.held }[state];
  const icon = { running: Timer, paused: Pause, ended: Lock, held: Pause }[state];
  const tone = { running: "live", paused: "pending", ended: "crash", held: "outlier" }[state] as "live" | "pending" | "crash" | "outlier";
  return (
    <div data-testid="heat-timer" data-state={state} data-size={size} className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        data-testid="heat-timer-clock"
        aria-label={`${T.remaining} ${formatClock(remainingMs)}`}
        className={cn("font-semibold tabular-nums", size === "head" ? "text-timer-head" : "text-timer-slim")}
      >
        {formatClock(remainingMs)}
      </span>
      <span data-testid="heat-timer-state">
        <Pill icon={icon} tone={tone}>
          {word}
        </Pill>
      </span>
      {onToggleSound ? (
        <button type="button" aria-pressed={!!soundOn} onClick={onToggleSound} className="inline-flex min-h-tap items-center gap-1 rounded-xl border border-beach-border bg-beach-bg px-3 text-small font-semibold text-beach-ink">
          {soundOn ? <Volume2 aria-hidden className="size-4" /> : <VolumeX aria-hidden className="size-4" />}
          {soundOn ? T.soundOn : T.soundOff}
        </button>
      ) : null}
    </div>
  );
}
