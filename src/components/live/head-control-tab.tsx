"use client";

import { useMemo, useState } from "react";
import { CircleOff, Clock, FastForward, Pause, Play, RotateCcw, Send, Square, Undo2, Wind } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { HeatTimer } from "./heat-timer";
import { Chip } from "./chip";
import { ConnectionBadge } from "./connection-badge";
import { Pill } from "./pill";
import { RiderLabel } from "@/components/rider-label";
import { formatClock } from "@/lib/live/timer";
import { headPhone } from "@/lib/live/design-fixtures";
import { controlsFor, nextHeatState, type ControlId, type HeatState } from "@/lib/live/head-state";
import { copy } from "@/lib/ui-copy";

const ICON: Record<ControlId, LucideIcon> = { start: Play, pause: Pause, resume: Play, end: Square, hold: Wind, resumeAt: Clock, shift5: FastForward, shift10: FastForward, publish: Send, cancel: CircleOff, rerun: RotateCcw, reopen: Undo2 };

/**
 * The head judge's Control tab. Start / Pause / Resume / End / Hold / Resume at / Shift, then Publish, Cancel heat and Re-run heat. Which buttons are on
 * follows the state of the heat (`controlsFor`). Rider totals and the list of what blocks Publish are behind Details. There is no timer reset.
 * Cancel heat and Re-run heat ask for a reason first.
 */
export function HeadControlTab() {
  const h = useMemo(() => headPhone(), []);
  const [state, setState] = useState<HeatState>("running");
  const [details, setDetails] = useState(false);
  const [asking, setAsking] = useState<null | "cancel" | "rerun">(null);
  const [reason, setReason] = useState("");
  const [blockers, setBlockers] = useState(h.blockers);
  const T = copy.live.head;
  const label: Record<ControlId, string> = { start: T.start, pause: T.pause, resume: T.resume, end: T.end, hold: T.hold, resumeAt: T.resumeAt, shift5: T.shift5, shift10: T.shift10, publish: T.publish, cancel: T.cancel, rerun: T.rerun, reopen: T.reopen };
  const controls = controlsFor(state, blockers.length);
  const press = (id: ControlId) => {
    if (id === "cancel" || id === "rerun") return setAsking(id);
    if (id === "end") setBlockers(h.blockers);
    setState((s) => nextHeatState(s, id));
  };
  return (
    <div data-testid="head-control" data-state={state} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-small font-semibold">{h.heatName}</p>
        <span className="flex items-center gap-1.5">
          <ConnectionBadge status="synced" />
          <Chip data-testid="details-toggle" pressed={details} onClick={() => setDetails((d) => !d)}>
            {details ? copy.live.header.detailsOn : copy.live.header.details}
          </Chip>
        </span>
      </div>
      {details ? (
        <div data-testid="head-details" className="flex flex-col gap-2">
          <h3 className="text-heading font-semibold text-beach-muted">{T.totals}</h3>
          <ul className="flex flex-col gap-1">
            {h.totals.map((t) => (
              <li key={t.place} className="flex items-center justify-between gap-2 rounded-xl border border-beach-line bg-beach-surface px-2 py-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="text-name font-semibold tabular-nums">{t.place}</span>
                  <RiderLabel model={t.label} variant="live" bare />
                </span>
                <span className="text-name font-semibold tabular-nums">{t.totalLabel}</span>
              </li>
            ))}
          </ul>
          <h3 className="text-heading font-semibold text-beach-muted">{T.blockers}</h3>
          {blockers.length ? (
            <ul data-testid="blockers" className="flex flex-col gap-1">
              {blockers.map((b) => (
                <li key={b} className="rounded-xl border border-beach-outlier bg-beach-bg px-2 py-1 text-body font-medium">
                  {b}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body font-medium text-beach-muted">{T.noBlockers}</p>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-card border border-beach-line bg-beach-surface p-2">
            {state === "scheduled" || state === "published" ? (
              <>
                <span className="text-timer-head font-semibold tabular-nums">{formatClock(state === "scheduled" ? 600_000 : 0)}</span>
                <Pill tone="ink">{T.stateWord[state]}</Pill>
              </>
            ) : (
              <HeatTimer remainingMs={h.remainingMs} state={state === "under_review" || state === "cancelled" ? "ended" : state} size="head" />
            )}
          </div>
          <p className="text-small font-medium text-beach-muted">{T.next(h.next.heat, h.next.time)}</p>
          <div className="flex flex-wrap gap-1.5">
            {controls.map((c) => (
              <Chip key={c.id} data-control={c.id} icon={ICON[c.id]} variant={!c.enabled ? "muted" : c.id === "start" || c.id === "publish" ? "accent" : c.id === "cancel" ? "danger" : "plain"} disabled={!c.enabled} onClick={() => press(c.id)}>
                {label[c.id]}
              </Chip>
            ))}
          </div>
          <p className="text-small font-medium text-beach-muted">{T.noReset}</p>
        </>
      )}
      {asking ? (
        <div role="alertdialog" aria-label={asking === "cancel" ? T.cancel : T.rerun} className="flex flex-col gap-1.5 rounded-card border border-beach-border bg-beach-surface p-2">
          <p className="text-body font-semibold">{asking === "cancel" ? T.cancel : T.rerun}</p>
          <label htmlFor="head-reason" className="text-small font-medium text-beach-muted">
            {copy.live.console.reason}
          </label>
          <input id="head-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={copy.live.console.reasonPlaceholder} className="min-h-tap rounded-lg border border-beach-border bg-beach-bg px-2 text-body font-medium text-beach-ink" />
          <div className="flex gap-1.5">
            <Chip
              variant={reason.trim() ? "accent" : "muted"}
              disabled={!reason.trim()}
              onClick={() => {
                setAsking(null);
                setReason("");
                if (asking === "cancel") setState("scheduled");
              }}
            >
              {copy.live.console.save}
            </Chip>
            <Chip onClick={() => { setAsking(null); setReason(""); }}>{copy.live.console.cancel}</Chip>
          </div>
        </div>
      ) : null}
    </div>
  );
}
