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
  plain = false,
}: {
  /** The header as it was before the scoreboard bar (a light header): only the /design comparison uses it. */
  plain?: boolean;
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
    <header data-testid="screen-header" className={plain ? "flex flex-col gap-1 border-b border-beach-line bg-beach-bg px-2 pb-1 pt-1" : "flex flex-col gap-1 border-b border-beach-line bg-beach-board px-2 pb-1 pt-1 text-beach-on-board [&_[data-testid=heat-timer-clock]]:text-[24px]"}>
      {/* the first row is the flag strip (or the timer) alone and full width: nothing sits beside it to squeeze or cut its words */}
      <div className="flex min-w-0 items-center gap-2">
        {flag ? <FlagStrip model={flag} /> : showTimer ? <HeatTimer remainingMs={remainingMs} state={timerState} /> : <span className={plain ? "text-name font-bold" : "text-name font-bold text-beach-on-board"}>{copy.live.header.between}</span>}
      </div>
      {/* the second row: the heat and seat (they wrap), then Details, the sync state and the one round settings button */}
      <div className="flex items-center justify-between gap-2">
        <p className={plain ? "min-w-0 flex-1 text-small font-medium leading-tight text-beach-muted" : "min-w-0 flex-1 text-small font-medium leading-tight text-beach-board-muted"}>
          <span className={plain ? "font-bold text-beach-ink" : "font-bold text-beach-on-board"}>{heatName}</span> · {seat}
          {clock ? (
            <>
              {" · "}
              <ClockText timezone={clock.timezone} nowMs={clock.nowMs} className="text-small text-inherit" />
            </>
          ) : null}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          {details !== undefined ? (
            <Chip onBoard={!plain} data-testid="details-toggle" pressed={details} onClick={onToggleDetails}>
              {details ? (detailsLabels?.on ?? copy.live.header.detailsOn) : (detailsLabels?.off ?? copy.live.header.details)}
            </Chip>
          ) : null}
          <ConnectionBadge status={connection} pending={pending} onRetry={onRetry} />
          <SettingsMenu onBoard={!plain} />
        </div>
      </div>
    </header>
  );
}
