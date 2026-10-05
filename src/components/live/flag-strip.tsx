import { Volume2, VolumeX } from "lucide-react";
import { textOn, type FlagState } from "@/lib/live/flags";
import { formatClock } from "@/lib/live/timer";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

/** What the strip is drawn from: the state of the flags, the words on it, and the heat it is about. */
export interface FlagStripModel {
  state: FlagState;
  /** The words ("Running", "Finished — next: Heat 5, est. 10:40", "Paused", "Hold — times update when we resume"). */
  words: string;
  heatName: string;
  /** "Heat 5": the short name the announcer's cues use. */
  heatShort: string;
  /** Beside the state word of the red banner: "Next heat in 3:40 · Advanced · R2 · Heat 12 · est. 14:20" (from the run order), or null. */
  nextPart?: string | null;
}

/** The old timer's `data-state`, so the tests and screens that read it keep working. */
const timerStateOf = (s: FlagState): string => (s.kind === "stopped" ? (s.why === "paused" ? "paused" : s.why === "hold" ? "held" : "ended") : s.kind === "before_start" ? "before_start" : "running");

/**
 * The flag strip: the clock line of every live screen, filled with the state's colour (black on yellow, white on green and red), showing the state's words, the
 * countdown (pre-start remaining, then heat remaining) and the heat name. Same height as the clock line it replaces ("slim" 56 px for judge and spotter, "head" for
 * the head judge's console), and the words are always there: colour is never the only signal.
 */
export function FlagStrip({ model, size = "slim", soundOn, onToggleSound, className }: { model: FlagStripModel; size?: "slim" | "head"; soundOn?: boolean; onToggleSound?: () => void; className?: string }) {
  const { state } = model;
  const ink = textOn(state.colour);
  return (
    <div
      data-testid="heat-timer"
      data-flag={state.kind}
      data-why={state.why ?? ""}
      data-state={timerStateOf(state)}
      data-size={size}
      role="status"
      aria-label={`${state.label}${state.countdownMs !== null ? ` ${formatClock(state.countdownMs)}` : ""}${model.heatName ? `, ${model.heatName}` : ""}`}
      style={{ backgroundColor: state.colour, color: ink }}
      className={cn("flex min-h-tap min-w-0 flex-1 items-center gap-x-2 rounded-xl px-2", model.nextPart ? "flex-wrap gap-y-0.5 py-1" : "overflow-hidden", className)}
    >
      <span data-testid="heat-timer-state" className={cn("min-w-0 text-small font-bold", model.nextPart ? "shrink-0" : "shrink truncate")}>
        {model.words}
      </span>
      {model.nextPart ? (
        <span data-testid="flag-next-heat" className="min-w-0 flex-1 basis-48 whitespace-normal break-words text-small font-semibold tabular-nums">
          {model.nextPart}
        </span>
      ) : null}
      {state.countdownMs !== null ? (
        <span data-testid="heat-timer-clock" className={cn("shrink-0 font-bold tabular-nums", size === "head" ? "text-timer-head" : "text-timer-slim")}>
          {formatClock(state.countdownMs)}
        </span>
      ) : null}
      {model.heatName ? (
        <span data-testid="flag-heat" className="ml-auto min-w-0 flex-1 truncate text-right text-small font-semibold">
          {model.heatName}
        </span>
      ) : null}
      {onToggleSound ? (
        <button type="button" aria-pressed={!!soundOn} onClick={onToggleSound} className="inline-flex min-h-tap shrink-0 items-center gap-1 rounded-lg border border-current px-2 text-small font-semibold">
          {soundOn ? <Volume2 aria-hidden className="size-4" /> : <VolumeX aria-hidden className="size-4" />}
          {soundOn ? copy.live.timer.soundOn : copy.live.timer.soundOff}
        </button>
      ) : null}
    </div>
  );
}
