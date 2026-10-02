"use client";

import { ClockText } from "@/components/clock-text";
import { HeadMatrix } from "./head-matrix";
import { Pill } from "./pill";
import { RiderLabel } from "@/components/rider-label";
import { outlierTolerance } from "@/lib/live/cell-tone";
import type { HeadModel } from "@/lib/live/head-model";
import { heatTitle } from "@/lib/live/run-order";
import type { HeatRider } from "@/lib/live/screen-model";
import type { AttemptRow, HeatRow, LiveContext, LiveDivisionContext } from "@/lib/live/types";
import { copy } from "@/lib/ui-copy";

const H = copy.headLive;

/**
 * The announcer's view (docs/06 §9, `?mode=announcer` on the head page, or an announcer seat): the heat that is on, read-only: the live score table, the rider totals and
 * the feed of attempts as they are logged. Nothing here changes anything. Rider bios wait for Phase 6.
 */
export function AnnouncerView({ ctx, heat, division, attempts, riders, head, wordFor, nowMs }: { nowMs: number; ctx: LiveContext; heat: HeatRow; division: LiveDivisionContext; attempts: AttemptRow[]; riders: HeatRider[]; head: HeadModel; wordFor: (entryId: string) => string }) {
  const feed = [...attempts].filter((a) => !a.deleted_at).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return (
    <div data-testid="announcer-view" className="flex flex-col gap-2 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-name font-semibold">{heatTitle(ctx, heat)}</h1>
        <Pill tone={heat.status === "running" ? "live" : "ink"}>{copy.heatControl.status[heat.status] ?? heat.status}</Pill>
        <ClockText timezone={ctx.event.timezone} nowMs={nowMs} />
      </div>
      <p className="text-small font-medium text-beach-muted">{H.announcerNote}</p>
      <div className="grid items-start gap-2 min-[1100px]:grid-cols-[minmax(0,1fr)_18rem]">
        <HeadMatrix tolerance={outlierTolerance(division.model)} model={{ judgeIds: head.matrix.judgeIds, rows: head.matrix.rows }} />
        <div className="flex flex-col gap-2">
          <section aria-label={copy.heatControl.totals} className="flex flex-col gap-1 rounded-card border border-beach-line bg-beach-surface p-2">
            <h2 className="text-heading font-semibold text-beach-muted">{copy.heatControl.totals}</h2>
            {head.totals.map((t) => {
              const r = riders.find((x) => x.entryId === t.entryId);
              return (
                <div key={t.entryId} data-testid="announcer-total" className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1">{r ? <RiderLabel model={r.label} variant="live" bare /> : wordFor(t.entryId)}</span>
                  <span className="shrink-0 text-name font-semibold tabular-nums">{t.totalLabel}</span>
                </div>
              );
            })}
          </section>
          <section data-testid="announcer-feed" aria-label={H.feedHeading} className="flex flex-col gap-1 rounded-card border border-beach-line bg-beach-surface p-2">
            <h2 className="text-heading font-semibold text-beach-muted">{H.feedHeading}</h2>
            {feed.slice(0, 30).map((a) => (
              <p key={a.id} data-testid="feed-line" className="text-small font-medium">
                {H.feedLine(wordFor(a.entry_id), a.seq, a.trick_name ?? "", a.status === "landed")}
              </p>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
