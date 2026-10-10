import Link from "next/link";
import { Check, Clock, Flag, Pause, Pin, Radio } from "lucide-react";
import type { PublicRow, PublicRowState } from "@/lib/public/timetable";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const H = copy.pub.home;
const ICON: Record<PublicRowState, typeof Check> = { done: Check, live: Radio, next: Flag, est: Clock, held: Pause, pinned: Pin, cancelled: Clock };

export function StateBadge({ status, walkover = false }: { status: PublicRowState; walkover?: boolean }) {
  const Icon = ICON[status];
  return (
    <span data-testid="row-state" className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 text-small font-semibold", status === "live" ? "border-beach-live text-beach-live" : "border-beach-line text-beach-muted")}>
      <Icon aria-hidden className="size-3" />
      {walkover ? copy.walkover.word.walkover : H.states[status]}
    </span>
  );
}

/** A time as the public reads it: "est. 15:23" for a projection, the plain time when it is exact or pinned. */
export const timeText = (r: Pick<PublicRow, "start" | "estimated" | "status">): string => (r.start ? (r.estimated ? `${copy.pub.common.est} ${r.start}` : r.start) : "–");

/** Today's timetable: Division · Round · Heat, start, state. Rows read from the run order and the heats' real times. */
export function TimetableList({ rows, heatHref }: { rows: PublicRow[]; heatHref?: (heatId: string) => string }) {
  return (
    <ol data-testid="timetable" className="flex flex-col divide-y divide-beach-line rounded-card border border-beach-line bg-beach-surface">
      {rows.map((r) => (
        <li key={r.itemId} data-testid="timetable-row" data-state={r.status} className="flex items-center justify-between gap-2 px-2 py-1.5">
          <div className="flex min-w-0 flex-col">
            <span className={cn("truncate text-body", r.kind === "heat" ? "font-semibold" : "font-medium text-beach-muted")}>
              {r.heatId && heatHref ? (
                <Link prefetch={false} href={heatHref(r.heatId)} className="underline-offset-2 hover:underline">
                  {r.title}
                </Link>
              ) : (
                r.title
              )}
            </span>
            {r.resultHeld ? <span className="text-small font-medium text-beach-muted">{H.resultHeld}</span> : null}
            {r.warmUpStart && r.status !== "done" && r.status !== "live" ? <span className="text-small font-medium text-beach-muted">{H.warmUp(r.warmUpStart)}</span> : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <span data-testid="row-time" className="text-name font-semibold tabular-nums">
              {timeText(r)}
            </span>
            {r.kind === "heat" ? <StateBadge status={r.status} walkover={r.walkover} /> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
