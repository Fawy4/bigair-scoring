import { HeatTimer, type TimerState } from "./heat-timer";
import { ConnectionBadge, type ConnectionStatus } from "./connection-badge";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

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
  details,
  onToggleDetails,
}: {
  heatName: string;
  seat: string;
  remainingMs: number;
  timerState?: TimerState;
  connection?: ConnectionStatus;
  pending?: number;
  /** undefined = no Details toggle (the spotter has none). */
  details?: boolean;
  onToggleDetails?: () => void;
}) {
  return (
    <header data-testid="screen-header" className="flex flex-col border-b border-beach-line bg-beach-bg px-2 pb-1 pt-0.5">
      <div className="flex min-h-tap items-center justify-between gap-2">
        <HeatTimer remainingMs={remainingMs} state={timerState} />
        {details !== undefined ? (
          <button
            type="button"
            data-testid="details-toggle"
            aria-pressed={details}
            onClick={onToggleDetails}
            className={cn("min-h-tap rounded-xl border px-3 text-body font-semibold", details ? "border-beach-accent bg-beach-accent text-beach-on-accent" : "border-beach-border bg-beach-bg text-beach-ink")}
          >
            {details ? copy.live.header.detailsOn : copy.live.header.details}
          </button>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-small font-medium text-beach-muted">{copy.live.header.heatLine(heatName, seat)}</p>
        <ConnectionBadge status={connection} pending={pending} />
      </div>
    </header>
  );
}
