export type TimerCue = "one_minute" | "time_up";

/**
 * The beep moments (docs/08 §1G-2): "one_minute" when the clock crosses 1:00 and "time_up" when it crosses 0:00. Nothing fires while paused, and
 * nothing fires after a reload that starts already past a moment (no previous reading). A long freeze that jumps over both gives only "time_up".
 */
export function timerCues(prevRemainingMs: number | null, remainingMs: number, paused = false): TimerCue | null {
  if (paused || prevRemainingMs === null) return null;
  if (prevRemainingMs > 0 && remainingMs <= 0) return "time_up";
  if (prevRemainingMs > 60_000 && remainingMs <= 60_000) return "one_minute";
  return null;
}
