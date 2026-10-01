import { HeatTimer, type TimerState } from "./heat-timer";
import { ConnectionBadge, type ConnectionStatus } from "./connection-badge";
import { Chip } from "./chip";
import { copy } from "@/lib/ui-copy";

/**
 * The slim header of the judge and spotter screens: the small timer, the sync pill and a "Details" toggle, then one muted line with the heat and the seat.
 * The timer is small and out of the way (never between the first card and the pad). The Details toggle switches the whole screen to the detailed view.
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
}: {
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
    <header data-testid="screen-header" className="flex flex-col border-b border-beach-line bg-beach-bg px-2 pb-0.5 pt-0.5">
      <div className="flex min-h-tap items-center justify-between gap-2">
        {showTimer ? <HeatTimer remainingMs={remainingMs} state={timerState} /> : <span className="text-name font-semibold">{copy.live.header.between}</span>}
        {details !== undefined ? (
          <Chip data-testid="details-toggle" pressed={details} onClick={onToggleDetails}>
            {details ? (detailsLabels?.on ?? copy.live.header.detailsOn) : (detailsLabels?.off ?? copy.live.header.details)}
          </Chip>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-small font-medium text-beach-muted">{copy.live.header.heatLine(heatName, seat)}</p>
        <ConnectionBadge status={connection} pending={pending} onRetry={onRetry} />
      </div>
    </header>
  );
}
