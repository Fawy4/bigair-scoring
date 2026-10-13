import { ClockText } from "@/components/clock-text";
import { HeatTimer, type TimerState } from "./heat-timer";
import { FlagStrip, type FlagStripModel } from "./flag-strip";
import { ConnectionBadge, type ConnectionStatus } from "./connection-badge";
import { Chip } from "./chip";
import { SettingsMenu } from "./live-shell";
import { copy } from "@/lib/ui-copy";

/**
 * The slim header of the judge and spotter screens (New look), drawn as the scoreboard bar: near-black across the full width, the timer (or the flag strip) in big white bold digits, the
 * heat in bold white and the seat in brand grey, the sync pill and the one round settings button. This bar is the product's one signature element. The "Details" / "Feed" / "Review"
 * switch, when a screen has one, sits in the first row. No boxes.
 */
export function ScreenHeader({
  heatName,
  seat,
  remainingMs,
  timerState = "running",
  connection = "synced",
  pending,
  onRetry,
  details,
  detailsLabels,
  onToggleDetails,
  showTimer = true,
  clock,
  flag,
}: {
  /** The flag strip (Flags): when set, it is the clock line, in the state's colour. Null/undefined (flags off): the plain timer as before. */
  flag?: FlagStripModel | null;
  /** The time now in the event time zone, small and muted next to the timer. */
  clock?: { timezone: string; nowMs: number };
  heatName: string;
  seat: string;
  remainingMs: number;
  timerState?: TimerState;
  connection?: ConnectionStatus;
  pending?: number;
  onRetry?: () => void;
  /** Words for the toggle (the spotter's says "Feed"). */
  detailsLabels?: { off: string; on: string };
  /** False between heats: no clock, just the lines. */
  showTimer?: boolean;
  /** undefined = no Details toggle (the spotter has none). */
  details?: boolean;
  onToggleDetails?: () => void;
}) {
  return (
    <header data-testid="screen-header" className="flex flex-col border-b border-beach-line bg-beach-board px-2 pb-1 pt-1 text-beach-on-board [&_[data-testid=heat-timer-clock]]:text-[24px]">
      <div className="flex min-h-[44px] items-center justify-between gap-2">
        <div className={flag ? "flex min-w-0 flex-1 items-center gap-2" : "flex min-w-0 flex-1 items-baseline gap-2"}>
          {flag ? <FlagStrip model={flag} /> : showTimer ? <HeatTimer remainingMs={remainingMs} state={timerState} /> : <span className="text-name font-bold text-beach-on-board">{copy.live.header.between}</span>}
          {clock ? <ClockText timezone={clock.timezone} nowMs={clock.nowMs} className="text-beach-board-muted" /> : null}
        </div>
        {details !== undefined ? (
          <Chip onBoard data-testid="details-toggle" pressed={details} onClick={onToggleDetails}>
            {details ? (detailsLabels?.on ?? copy.live.header.detailsOn) : (detailsLabels?.off ?? copy.live.header.details)}
          </Chip>
        ) : null}
        <SettingsMenu onBoard />
      </div>
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <p className="min-w-0 truncate text-small font-medium text-beach-board-muted">
          <span className="font-bold text-beach-on-board">{heatName}</span> · {seat}
        </p>
        <ConnectionBadge status={connection} pending={pending} onRetry={onRetry} />
      </div>
    </header>
  );
}
