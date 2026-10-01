import { Pause, Timer, Volume2, VolumeX, Lock } from "lucide-react";
import { formatClock } from "@/lib/live/timer";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

export type TimerState = "running" | "paused" | "ended" | "held";

/**
 * The heat clock: mm:ss in big type, and always a word for the state ("Paused", "Time up"), never colour alone.
 * It only draws what it is given; the clock maths (from the server's time) arrive in 5b.
 */
export function HeatTimer({ remainingMs, state, soundOn, onToggleSound }: { remainingMs: number; state: TimerState; soundOn?: boolean; onToggleSound?: () => void }) {
  const T = copy.live.timer;
  const word = { running: T.running, paused: T.paused, ended: T.ended, held: T.held }[state];
  const Icon = { running: Timer, paused: Pause, ended: Lock, held: Pause }[state];
  return (
    <div data-testid="heat-timer" data-state={state} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-beach-border bg-beach-surface p-3">
      <div className="flex flex-col">
        <span className="text-base font-bold text-beach-muted">{T.remaining}</span>
        <span data-testid="heat-timer-clock" aria-label={`${T.remaining} ${formatClock(remainingMs)}`} className={cn("font-mono text-timer tabular-nums", state === "ended" && "text-beach-crash", state === "paused" && "text-beach-pending")}>
          {formatClock(remainingMs)}
        </span>
      </div>
      <div className="flex flex-col items-end gap-2">
        <span
          data-testid="heat-timer-state"
          className={cn(
            "inline-flex min-h-tap items-center gap-2 rounded-full border-2 border-current px-4 text-xl font-extrabold",
            state === "running" && "text-beach-live",
            state === "paused" && "text-beach-pending",
            state === "held" && "text-beach-outlier",
            state === "ended" && "text-beach-crash",
          )}
        >
          <Icon aria-hidden className="size-6" />
          {word}
        </span>
        {onToggleSound ? (
          <button type="button" aria-pressed={!!soundOn} onClick={onToggleSound} className="inline-flex min-h-tap items-center gap-2 rounded-lg border-2 border-beach-border bg-beach-bg px-4 text-lg font-bold text-beach-ink">
            {soundOn ? <Volume2 aria-hidden className="size-6" /> : <VolumeX aria-hidden className="size-6" />}
            {soundOn ? T.soundOn : T.soundOff}
          </button>
        ) : null}
      </div>
    </div>
  );
}
