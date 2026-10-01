import { Clock, Pause, Play, Send, Square, Undo2, Wind, FastForward } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { HeatTimer } from "./heat-timer";
import { ConnectionBadge } from "./connection-badge";
import type { HeadControl } from "@/lib/live/design-fixtures";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const ICON: Record<HeadControl["id"], LucideIcon> = { pause: Pause, resume: Play, end: Square, hold: Wind, resumeAt: Clock, shift5: FastForward, shift10: FastForward, publish: Send, reopen: Undo2 };

/**
 * The head judge's phone: the heat, its big timer (48 px: the head console and the big screen are the only places it is that large), and the controls.
 * Controls only: the score table and totals need a tablet or laptop. Publish is the accent button and is off while the heat is running.
 */
export function HeadControls({ heatName, state, remainingMs, next, controls, onPress }: { heatName: string; state: "running" | "paused" | "ended" | "held"; remainingMs: number; next: { heat: string; time: string }; controls: HeadControl[]; onPress?: (id: HeadControl["id"]) => void }) {
  const T = copy.live.head;
  const label: Record<HeadControl["id"], string> = { pause: T.pause, resume: T.resume, end: T.end, hold: T.hold, resumeAt: T.resumeAt, shift5: T.shift5, shift10: T.shift10, publish: T.publish, reopen: T.reopen };
  return (
    <div data-testid="head-controls" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-name font-semibold">{heatName}</p>
        <ConnectionBadge status="synced" />
      </div>
      <div className="rounded-card border border-beach-line bg-beach-surface p-3">
        <HeatTimer remainingMs={remainingMs} state={state} size="head" />
        <p className="mt-1 text-small font-medium text-beach-muted">{T.next(next.heat, next.time)}</p>
      </div>
      <h3 className="text-small font-semibold text-beach-muted">{T.heading}</h3>
      <div className="grid grid-cols-2 gap-2">
        {controls.map((c) => {
          const Icon = ICON[c.id];
          const primary = c.id === "publish";
          return (
            <button
              key={c.id}
              type="button"
              data-control={c.id}
              disabled={!c.enabled}
              onClick={() => onPress?.(c.id)}
              className={cn(
                "inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border px-3 text-body font-semibold",
                !c.enabled ? "border-dashed border-beach-line bg-beach-surface text-beach-muted" : primary ? "border-beach-accent bg-beach-accent text-beach-on-accent" : c.id === "end" ? "border-beach-crash bg-beach-bg text-beach-ink" : "border-beach-border bg-beach-bg text-beach-ink",
              )}
            >
              <Icon aria-hidden className="size-5" />
              {label[c.id]}
            </button>
          );
        })}
      </div>
      <p className="rounded-xl border border-dashed border-beach-line p-3 text-body font-medium text-beach-muted">{T.scoreTable}</p>
    </div>
  );
}
