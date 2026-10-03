"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Hourglass, Users } from "lucide-react";
import { RiderLabel } from "@/components/rider-label";
import { fitCard, impressionGrid, LEVELS, type CardLevel } from "@/lib/live/impression-card";
import type { JudgeImpressions } from "@/lib/live/impression-status";
import { judgeWordOf, type JudgeName } from "@/lib/live/judge-names";
import type { ChecklistItem, FixTarget } from "@/lib/live/publish-checklist";
import type { ReviewBarState } from "@/lib/live/review-bar";
import type { HeatRider } from "@/lib/live/screen-model";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const R = copy.headLive.reviewBar;
const I = copy.headLive.impressionCard;
const small = "min-h-tap rounded-lg border border-beach-border bg-beach-bg px-2 text-small font-semibold text-beach-ink";
// the same distance bands as the trick scores in the table: within tolerance green, then yellow, orange, red (literal class names for Tailwind)
const DIST = ["bg-beach-tint-dist0", "bg-beach-tint-dist1", "bg-beach-tint-dist2", "bg-beach-tint-dist3"];

/**
 * The review bar: one full-width line directly under the heat's header, from End heat until Publish. Amber while judges have not submitted (each name opens that
 * judge's sheet), red with the first Publish blocker's own words (with Fix and Absent), green when everything is in. While the heat is on the water it is a quiet
 * one-liner with no fill. Colour is never alone: every state has an icon and a sentence.
 */
export function ReviewBar({
  state,
  onSheet,
  onFix,
  onAbsent,
  onChooseOrder,
  pending,
}: {
  state: ReviewBarState;
  onSheet: (seatId: string) => void;
  onFix: (target: FixTarget) => void;
  onAbsent: (item: ChecklistItem) => void;
  onChooseOrder: (riders: string[]) => void;
  pending?: boolean;
}) {
  const base = "flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-card border px-2 py-1 text-body font-semibold";
  if (state.kind === "running") {
    return (
      <p data-testid="review-bar" data-state="running" role="status" className={cn(base, "border-beach-line bg-beach-bg font-medium text-beach-muted")}>
        <Users aria-hidden className="size-4 shrink-0" />
        {R.running(state.scoring, state.total)}
      </p>
    );
  }
  if (state.kind === "waiting") {
    return (
      <div data-testid="review-bar" data-state="waiting" role="status" aria-label={R.label} className={cn(base, "border-beach-outlier bg-beach-tint-dist1 text-beach-ink")}>
        <Hourglass aria-hidden className="size-4 shrink-0" />
        <span>{R.waiting(state.waiting.length, state.total)}</span>
        <span className="flex flex-wrap items-center gap-1">
          {state.waiting.map((w) => (
            <button key={w.seatId} type="button" data-testid="review-bar-judge" data-seat={w.seatId} aria-label={R.openSheet(w.word)} onClick={() => onSheet(w.seatId)} className={cn(small, "underline")}>
              {w.word}
            </button>
          ))}
        </span>
      </div>
    );
  }
  if (state.kind === "blocked") {
    const { item } = state;
    const absentable = (item.kind === "score" || item.kind === "impression") && Boolean(item.target);
    return (
      <div data-testid="review-bar" data-state="blocked" role="status" aria-label={R.label} className={cn(base, "border-beach-crash bg-beach-tint-dist3 text-beach-ink")}>
        <CircleAlert aria-hidden className="size-4 shrink-0" />
        <span data-testid="review-bar-text" className="min-w-0 flex-1">
          {R.blocked} {item.text}
          {state.more > 0 ? ` (${R.more(state.more)})` : ""}
        </span>
        {item.kind === "tie" && item.riders ? (
          <button type="button" data-testid="review-bar-order" disabled={pending} onClick={() => onChooseOrder(item.riders!)} className={small}>
            {copy.headLive.chooseOrder}
          </button>
        ) : null}
        {item.target ? (
          <button type="button" data-testid="review-bar-fix" disabled={pending} aria-label={copy.checklist.fixAria(item.text)} onClick={() => onFix(item.target!)} className={small}>
            {R.fix}
          </button>
        ) : null}
        {absentable ? (
          <button type="button" data-testid="review-bar-absent" disabled={pending} onClick={() => onAbsent(item)} className={small}>
            {R.absent}
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <p data-testid="review-bar" data-state="ready" role="status" className={cn(base, "border-beach-live bg-beach-tint-dist0 text-beach-ink")}>
      <CheckCircle2 aria-hidden className="size-4 shrink-0" />
      {R.ready(state.total)}
    </p>
  );
}

interface CardProps {
  judges: JudgeName[];
  impressions: JudgeImpressions[];
  riders: HeatRider[];
  tolerance: number;
  /** Tap a cell to correct it (as with any score); without it the cells are plain. */
  onCell?: (seatId: string, entryId: string) => void;
}

/** The grid itself, at one of the sizes of `LEVELS`: one column per judge (the table header's short name over its J-number), a Panel column, one row per rider. */
function Grid({ judges, impressions, riders, tolerance, onCell, level, title = true }: CardProps & { level: CardLevel; title?: boolean }) {
  const size = LEVELS[level];
  const rows = impressionGrid({ impressions, riderOrder: riders.map((r) => r.entryId), tolerance, words: { missing: "—", absent: copy.live.matrix.absent } });
  const cols = `${size.labelW}px repeat(${judges.length + 1}, ${size.cellW}px)`;
  const text = size.small ? "text-small" : "text-body";
  return (
    <div data-testid="impression-grid" data-level={level} role="table" aria-label={I.heading} className={cn("grid gap-x-1 leading-none text-beach-ink", text)} style={{ gridTemplateColumns: cols }}>
      <div role="row" className="contents">
        <span role="columnheader" className="flex items-end overflow-hidden" style={{ height: size.headH }}>
          {title ? <h3 className="truncate text-small font-semibold text-beach-muted">{I.heading}</h3> : null}
        </span>
        {judges.map((j) => (
          <span key={j.id} role="columnheader" data-testid="impression-judge" className="flex flex-col items-center justify-center overflow-hidden text-center font-semibold" style={{ height: size.headH }}>
            <span className="max-w-full truncate text-small leading-tight">{judgeWordOf(j)}</span>
            {j.name ? <span className="max-w-full truncate text-[0.7rem] font-medium text-beach-muted">{j.tag}</span> : null}
          </span>
        ))}
        <span role="columnheader" className="flex items-center justify-center text-small font-semibold text-beach-muted" style={{ height: size.headH }}>
          {copy.live.matrix.panel}
        </span>
      </div>
      {rows.map((row) => {
        const rider = riders.find((r) => r.entryId === row.entryId);
        return (
          <div key={row.entryId} role="row" data-testid="impression-row" data-rider={row.entryId} className="contents">
            <span role="rowheader" className="flex min-w-0 items-center overflow-hidden" style={{ height: size.rowH }}>
              {rider ? <RiderLabel model={{ ...rider.label, secondary: rider.label.secondary.filter((x) => x.key === "name") }} variant="live" bare className="[&_*]:!text-small [&_*]:!leading-none" /> : null}
            </span>
            {row.cells.map((c, i) => {
              const judge = judges[i];
              const cls = cn("flex w-full items-center justify-center gap-0.5 rounded-md border font-semibold tabular-nums", c.state === "done" ? "border-beach-line" : "border-dashed border-beach-missing text-beach-missing", c.tone ? DIST[c.tone.band] : "bg-beach-bg");
              const body = (
                <>
                  {c.label}
                  {c.tone?.delta ? <span className="text-[0.65rem] font-semibold">{c.tone.delta}</span> : null}
                </>
              );
              const aria = I.aria(judgeWordOf(judge), rider ? (rider.label.secondary.find((x) => x.key === "name")?.text ?? rider.label.primary.text) : "", c.label);
              return onCell ? (
                <button key={c.seatId} type="button" data-testid="impression-cell" data-state={c.state} data-band={c.tone?.band} data-seat={c.seatId} data-rider={row.entryId} aria-label={aria} onClick={() => onCell(c.seatId, row.entryId)} className={cls} style={{ height: size.rowH - 2 }}>
                  {body}
                </button>
              ) : (
                <span key={c.seatId} data-testid="impression-cell" data-state={c.state} data-band={c.tone?.band} className={cls} style={{ height: size.rowH - 2 }}>
                  {body}
                </span>
              );
            })}
            <span data-testid="impression-panel" className="flex items-center justify-center font-semibold tabular-nums" style={{ height: size.rowH }}>
              {row.panelLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The Impression card beside the rider cards, in the same row above the table: "Impression" once, one column per judge, a Panel column and one row per rider.
 * It never makes the row taller (so it never pushes the table down): it takes the room that is left beside the cards, tighter spacing first, then smaller digits down
 * to the table's smallest text, and when even that does not fit it is a single "Impression" button that opens the same grid as a pop-over.
 */
export function ImpressionCardInline(props: CardProps) {
  const region = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<{ w: number; h: number } | null>(null);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const el = region.current;
    if (!el) return;
    const read = () => setRoom({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => !region.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);
  const fit = room ? fitCard({ availW: room.w, availH: room.h, riders: props.riders.length, judges: props.judges.length }) : "button";
  return (
    // the region has no height of its own: the row is as tall as the rider cards, and the card is drawn inside that room
    <div ref={region} data-testid="impression-region" data-fit={String(fit)} className="relative min-h-tap min-w-[6.5rem] flex-[1_1_6.5rem] self-stretch">
      {fit === "button" ? (
        <>
          <button type="button" data-testid="impression-button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={cn(small, "h-full min-h-tap w-full")}>
            {I.button}
          </button>
          {open ? (
            <div data-testid="impression-popover" role="dialog" aria-label={I.heading} className="absolute right-0 top-full z-30 mt-1 flex flex-col gap-1 rounded-card border border-beach-border bg-beach-bg p-2 shadow-lg">
              <Grid {...props} level={0} onCell={props.onCell ? (s, e) => { setOpen(false); props.onCell!(s, e); } : undefined} />
            </div>
          ) : null}
        </>
      ) : (
        <section data-testid="impression-card" aria-label={I.heading} className="absolute inset-0 overflow-hidden rounded-card border border-beach-line bg-beach-surface px-1.5 pt-0.5">
          <Grid {...props} level={fit} />
        </section>
      )}
    </div>
  );
}

/** The phone's version: a block under the rider cards, open by default in the review state, always at the normal size. */
export function ImpressionCardBlock(props: CardProps & { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(props.defaultOpen ?? true);
  return (
    <section data-testid="impression-card" data-open={open} aria-label={I.heading} className="flex flex-col gap-1 rounded-card border border-beach-line bg-beach-surface p-2">
      <button type="button" data-testid="impression-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex min-h-tap items-center justify-between text-heading font-semibold text-beach-muted">
        {I.heading}
      </button>
      {open ? (
        <div className="overflow-x-auto">
          <Grid {...props} level={0} title={false} />
        </div>
      ) : null}
    </section>
  );
}
