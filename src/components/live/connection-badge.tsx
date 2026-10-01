import { CircleCheck, Clock, TriangleAlert, WifiOff } from "lucide-react";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

export type ConnectionStatus = "synced" | "pending" | "offline" | "failed";

/** Sync state: always an icon AND a word (docs/06 §00.5). "Failed" is a button that tries again. */
export function ConnectionBadge({ status, pending = 0, onRetry }: { status: ConnectionStatus; pending?: number; onRetry?: () => void }) {
  const T = copy.live.connection;
  const view = {
    synced: { text: T.synced, Icon: CircleCheck, tone: "text-beach-live" },
    pending: { text: T.pending(pending), Icon: Clock, tone: "text-beach-pending" },
    offline: { text: T.offline, Icon: WifiOff, tone: "text-beach-missing" },
    failed: { text: T.failed, Icon: TriangleAlert, tone: "text-beach-failed" },
  }[status];
  const body = (
    <>
      <view.Icon aria-hidden className="size-6 shrink-0" />
      <span>{view.text}</span>
    </>
  );
  const cls = cn("inline-flex min-h-tap items-center gap-2 rounded-full border-2 border-current bg-beach-surface px-4 text-lg font-extrabold", view.tone);
  if (status === "failed") {
    return (
      <button type="button" data-testid="connection-badge" data-status={status} onClick={onRetry} className={cls}>
        {body}
      </button>
    );
  }
  return (
    <span data-testid="connection-badge" data-status={status} role="status" className={cls}>
      {body}
    </span>
  );
}
