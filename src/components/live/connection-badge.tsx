import { CircleCheck, Clock, TriangleAlert, WifiOff } from "lucide-react";
import { Pill } from "./pill";
import { copy } from "@/lib/ui-copy";

export type ConnectionStatus = "synced" | "pending" | "offline" | "failed";

/** Sync state: a small pill with an icon AND a word (docs/06 §00.5). "Failed" is a button that tries again. */
export function ConnectionBadge({ status, pending = 0, onRetry }: { status: ConnectionStatus; pending?: number; onRetry?: () => void }) {
  const T = copy.live.connection;
  const view = {
    synced: { text: T.synced, icon: CircleCheck, tone: "live" as const },
    pending: { text: T.pending(pending), icon: Clock, tone: "pending" as const },
    offline: { text: T.offline, icon: WifiOff, tone: "missing" as const },
    failed: { text: T.failed, icon: TriangleAlert, tone: "failed" as const },
  }[status];
  if (status === "failed") {
    return (
      <button type="button" data-testid="connection-badge" data-status={status} onClick={onRetry} className="inline-flex min-h-tap items-center">
        <Pill icon={view.icon} tone={view.tone} className="min-h-[34px]">
          {view.text}
        </Pill>
      </button>
    );
  }
  return (
    <span data-testid="connection-badge" data-status={status} role="status" className="inline-flex">
      <Pill icon={view.icon} tone={view.tone}>
        {view.text}
      </Pill>
    </span>
  );
}
