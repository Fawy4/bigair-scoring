"use client";

import { useMemo, useState, useTransition } from "react";
import { HoldDialog, PublishDialog, ReopenDialog, RerunDialog } from "./head-dialogs";
import { HeatTimer } from "./heat-timer";
import { useLiveSettings } from "./live-shell";
import { Pill } from "./pill";
import { cancelHeat, endHeat, holdPlan, pauseHeat, resumeHeat, resumePlanAt, shiftPlan, startHeat, type ActionResult, type PlanActionResult } from "@/lib/live/heat-actions";
import { setHeatPublicLive, setPublishHold } from "@/lib/live/head-actions";
import { heatLabel } from "@/lib/live/run-order";
import { controlsFor, type ControlId, type HeatState } from "@/lib/live/head-state";
import { activePlanFor, heatTitle, livesFor, timetableOptions, type ActivePlan } from "@/lib/live/run-order";
import { computeTimetable, utcToLocalHHMM } from "@/lib/engine/schedule";
import { effectiveStatus, remainingMs } from "@/lib/live/timer";
import type { ChecklistItem } from "@/lib/live/publish-checklist";
import type { HeatRow, LiveContext } from "@/lib/live/types";
import type { Json } from "@/lib/supabase/database.types";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const T = copy.heatControl;

/** The heat buttons use the real heat state: a running heat whose time is up counts as ended (the database says the same). */
function stateOf(h: HeatRow, nowServer: number): HeatState {
  const eff = effectiveStatus({ status: h.status, durationSec: h.duration_sec, startedAt: h.started_at, pausedAt: h.paused_at, pausedTotalSec: h.paused_total_sec }, nowServer);
  if (eff === "cancelled" || eff === "under_review" || eff === "scheduled" || eff === "running" || eff === "paused" || eff === "published") return eff;
  return "ended";
}

function ControlButton({ children, onClick, disabled, tone = "plain", testId, reason }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: "plain" | "accent" | "danger"; testId: string; reason?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <button
        type="button"
        data-testid={testId}
        disabled={disabled}
        aria-describedby={disabled && reason ? `why-${testId}` : undefined}
        onClick={onClick}
        className={cn(
          "min-h-[48px] rounded-xl border px-3 text-body font-semibold",
          disabled ? "border-beach-line bg-beach-surface text-beach-muted" : tone === "accent" ? "border-beach-accent bg-beach-accent text-beach-on-accent" : tone === "danger" ? "border-beach-crash bg-beach-bg text-beach-ink" : "border-beach-border bg-beach-bg text-beach-ink",
        )}
      >
        {children}
      </button>
      {disabled && reason ? (
        <p id={`why-${testId}`} data-testid={`why-${testId}`} className="text-small font-medium text-beach-muted">
          {reason}
        </p>
      ) : null}
    </div>
  );
}

/** What the Control tab needs to publish and re-open: the blocker list in words, and what to do after a change. */
export interface ReviewProps {
  items: ChecklistItem[];
  canOverride: boolean;
  /** The riders of the shown heat, for Re-run heat ("who does not ride again"). */
  riders: Array<{ entryId: string; word: string; name: string }>;
  /** The riders of a tie (for "Choose order"). */
  onChooseOrder: (riders: string[]) => void;
  onChanged: () => void;
}

/**
 * The left column of the head judge's console and the Control tab of a phone (docs/PLAN-phase-5 step 1): the run order with each heat's state, and the buttons
 * of the selected heat: Start (with its refusals in plain words), Pause, Resume, End, Hold, Resume at, Shift, Cancel. Every press is a server action that
 * uses the database's own clock; the screen only shows what the database answered.
 */
export function HeatControl({ ctx, heats, selectedId, onSelect, nowServer, plans, onPlanChanged, review }: { ctx: LiveContext; heats: HeatRow[]; selectedId: string | null; onSelect: (id: string) => void; nowServer: number; plans: ActivePlan[]; onPlanChanged?: (planId: string, hold: Json | null, anchors: Json) => void; review?: ReviewProps }) {
  const settings = useLiveSettings();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [restart, setRestart] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [dialog, setDialog] = useState<"publish" | "reopen" | "rerun" | "hold" | null>(null);

  const plan = activePlanFor(plans, ctx.event.timezone, nowServer);
  const lives = useMemo(() => livesFor(ctx, heats, ctx.heatMeta), [ctx, heats]);
  const table = useMemo(() => (plan ? computeTimetable(plan.plan, lives, timetableOptions(plan, ctx.event.timezone, nowServer)) : null), [plan, lives, ctx.event.timezone, Math.floor(nowServer / 5000)]); // eslint-disable-line react-hooks/exhaustive-deps

  const order: Array<{ heat: HeatRow; time: string | null; held: boolean }> = useMemo(() => {
    if (table) {
      const listed = table.rows.filter((r) => r.kind === "heat" && r.heatId).flatMap((r) => {
        const heat = heats.find((h) => h.id === r.heatId);
        return heat ? [{ heat, time: r.start, held: r.status === "held" }] : [];
      });
      const rest = heats.filter((h) => !listed.some((l) => l.heat.id === h.id));
      return [...listed, ...rest.map((heat) => ({ heat, time: null, held: false }))];
    }
    const divisionOrder = new Map(ctx.divisions.map((d, i) => [d.id, i]));
    return [...heats]
      .sort((a, b) => (divisionOrder.get(a.division_id) ?? 0) - (divisionOrder.get(b.division_id) ?? 0) || a.number - b.number)
      .map((heat) => ({ heat, time: null, held: false }));
  }, [table, heats, ctx.divisions]);

  const selected = heats.find((h) => h.id === selectedId) ?? null;
  const state = selected ? stateOf(selected, nowServer) : null;
  const planId = plan?.id ?? null;
  const controls = new Map((state ? controlsFor(state, review?.items.length ?? 0, { hasPlan: Boolean(planId), publishOpensList: Boolean(review) }) : []).map((c) => [c.id, c]));
  const on = (id: ControlId) => Boolean(controls.get(id)?.enabled);
  const why = (id: ControlId) => controls.get(id)?.reason;
  const onHold = Boolean(plan?.plan.hold);

  const act = (label: string, run: () => Promise<ActionResult | PlanActionResult>, after?: () => void) =>
    startTransition(async () => {
      setMessage(null);
      const r = await run();
      setMessage(r.ok ? { ok: true, text: label } : { ok: false, text: r.message });
      if (r.ok && "anchors" in r && planId) onPlanChanged?.(planId, r.hold, r.anchors);
      if (r.ok) {
        setCancelling(false);
        setReason("");
        after?.();
      }
    });

  const title = selected ? heatTitle(ctx, selected) : "";
  const remaining = selected ? remainingMs({ status: selected.status, durationSec: selected.duration_sec, startedAt: selected.started_at, pausedAt: selected.paused_at, pausedTotalSec: selected.paused_total_sec }, nowServer) : 0;
  const timerState = onHold && state === "scheduled" ? "held" : state === "paused" ? "paused" : state === "ended" || state === "under_review" || state === "published" || state === "cancelled" ? "ended" : "running";

  return (
    <section data-testid="heat-control" aria-label={T.heading} className="flex flex-col gap-3">
      <h2 className="text-heading font-semibold text-beach-muted">{T.runOrder}</h2>
      {!plan && heats.length > 0 ? <p className="text-small font-medium text-beach-muted">{T.noPlan}</p> : null}
      {order.length === 0 ? (
        <p data-testid="no-heats" className="text-body font-medium text-beach-muted">
          {T.empty}
        </p>
      ) : (
        <ol data-testid="run-order" className="flex max-h-[34dvh] flex-col divide-y divide-beach-line overflow-y-auto rounded-xl border border-beach-line bg-beach-bg">
          {order.map(({ heat, time, held }) => {
            const st = stateOf(heat, nowServer);
            const word = T.status[st === "ended" && heat.status === "under_review" ? "under_review" : st] ?? st;
            return (
              <li key={heat.id}>
                <button
                  type="button"
                  data-testid="order-row"
                  data-heat={heat.id}
                  data-state={st}
                  aria-pressed={selectedId === heat.id}
                  onClick={() => onSelect(heat.id)}
                  className={cn("flex min-h-[48px] w-full items-center justify-between gap-2 px-2 text-left", selectedId === heat.id && "bg-beach-surface")}
                >
                  <span className={cn("min-w-0 truncate text-body", selectedId === heat.id ? "font-bold" : "font-semibold")}>{heatTitle(ctx, heat)}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {heat.started_at ? (
                      <span className="text-small font-medium text-beach-muted">{T.startedAt(utcToLocalHHMM(heat.started_at, ctx.event.timezone))}</span>
                    ) : time && !held ? (
                      <span className="text-small font-medium text-beach-muted">{T.est(time)}</span>
                    ) : held ? (
                      <Pill tone="outlier">{copy.live.timer.held}</Pill>
                    ) : null}
                    <Pill tone={st === "running" ? "live" : st === "paused" ? "pending" : st === "ended" ? "crash" : st === "cancelled" ? "missing" : "ink"}>{word}</Pill>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {selected && state ? (
        <div data-testid="selected-heat" data-state={state} className="flex flex-col gap-2 rounded-card border border-beach-line bg-beach-surface p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-name font-semibold">{title}</p>
            <Pill tone="ink">{T.status[selected.status === "under_review" ? "under_review" : state === "ended" && selected.status === "running" ? "ended" : state] ?? state}</Pill>
          </div>
          <HeatTimer remainingMs={remaining} state={timerState} size="head" soundOn={settings.soundOn} onToggleSound={() => settings.setSoundOn(!settings.soundOn)} />
          {state === "cancelled" ? (
            <p data-testid="cancelled-note" className="rounded-lg border border-beach-crash bg-beach-bg px-2 py-1 text-body font-semibold">
              {(() => {
                const again = heats.find((h) => h.rerun_of === selected.id);
                return again ? copy.headLive.cancelledRerun(heatLabel(again)) : copy.heatControl.status.cancelled;
              })()}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <ControlButton testId="start" tone="accent" reason={why("start")} disabled={pending || !on("start")} onClick={() => act(T.done.start(title), () => startHeat(selected.id))}>
                  {T.start}
                </ControlButton>
                <ControlButton testId="end" reason={why("end")} disabled={pending || !on("end")} onClick={() => act(T.done.end(title), () => endHeat(selected.id))}>
                  {T.end}
                </ControlButton>
                <ControlButton testId="pause" reason={why("pause")} disabled={pending || !on("pause")} onClick={() => act(T.done.pause(title), () => pauseHeat(selected.id))}>
                  {T.pause}
                </ControlButton>
                <ControlButton testId="resume" reason={why("resume")} disabled={pending || !on("resume")} onClick={() => act(T.done.resume(title), () => resumeHeat(selected.id))}>
                  {T.resume}
                </ControlButton>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ControlButton testId="hold" reason={why("hold")} disabled={pending || !on("hold") || onHold} onClick={() => planId && act(T.done.hold, () => holdPlan(planId))}>
                  {T.hold}
                </ControlButton>
                <div className="grid grid-cols-2 gap-2">
                  {[5, 10].map((m) => (
                    <ControlButton key={m} testId={`shift${m}`} reason={why(m === 5 ? "shift5" : "shift10")} disabled={pending || !on(m === 5 ? "shift5" : "shift10") || onHold} onClick={() => planId && act(T.done.shift(m), () => shiftPlan(planId, m))}>
                      {m === 5 ? T.shift5 : T.shift10}
                    </ControlButton>
                  ))}
                </div>
              </div>
              {onHold && plan?.plan.hold ? (
                <div data-testid="hold-panel" className="flex flex-col gap-2 rounded-xl border border-beach-border bg-beach-bg p-2">
                  <p className="text-body font-semibold">
                    {plan.plan.hold.reason ? T.onHoldReason(utcToLocalHHMM(plan.plan.hold.since, ctx.event.timezone), plan.plan.hold.reason) : T.onHold(utcToLocalHHMM(plan.plan.hold.since, ctx.event.timezone))}
                  </p>
                  <div className="flex items-end gap-2">
                    <label className="flex flex-col gap-1 text-small font-semibold">
                      {T.restartTime}
                      <input data-testid="restart-time" type="time" value={restart} onChange={(e) => setRestart(e.target.value)} className="min-h-[48px] rounded-xl border border-beach-border bg-beach-bg px-2 text-body" />
                    </label>
                    <ControlButton testId="resume-at" tone="accent" disabled={pending || !restart || !planId} onClick={() => planId && act(T.done.resumeAt(restart), () => resumePlanAt(planId, restart))}>
                      {T.resumeAt}
                    </ControlButton>
                  </div>
                </div>
              ) : null}
              {review && state !== "scheduled" ? (
                <section data-testid="visibility" aria-label={copy.headLive.visibilityHeading} className="flex flex-col gap-1.5 rounded-xl border border-beach-line bg-beach-bg p-2">
                  <p className="text-small font-semibold text-beach-muted">{copy.headLive.liveHeading}</p>
                  <div role="group" aria-label={copy.headLive.liveHeading} className="grid grid-cols-3 gap-1.5">
                    {([[null, copy.headLive.liveFollow], [true, copy.headLive.liveOn], [false, copy.headLive.liveOff]] as Array<[boolean | null, string]>).map(([v, text]) => (
                      <button
                        key={String(v)}
                        type="button"
                        data-testid={`live-${v === null ? "follow" : v ? "on" : "off"}`}
                        aria-pressed={selected.public_live === v}
                        disabled={pending}
                        onClick={() => act(copy.headLive.saved, async () => (await setHeatPublicLive(selected.id, v)) as ActionResult, review.onChanged)}
                        className={cn("min-h-[44px] rounded-xl border px-1 text-small font-semibold", selected.public_live === v ? "border-beach-accent bg-beach-accent text-beach-on-accent" : "border-beach-border bg-beach-bg text-beach-ink")}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                  {state === "published" ? (
                    selected.publish_hold ? (
                      <>
                        <p data-testid="held-note" className="text-small font-semibold">{copy.headLive.heldNote}</p>
                        <ControlButton testId="release" tone="accent" disabled={pending} onClick={() => act(copy.headLive.released, async () => (await setPublishHold(selected.id, false)) as ActionResult, review.onChanged)}>
                          {copy.headLive.release}
                        </ControlButton>
                      </>
                    ) : (
                      <ControlButton testId="hold-result" disabled={pending} onClick={() => setDialog("hold")}>
                        {copy.headLive.hold}
                      </ControlButton>
                    )
                  ) : null}
                </section>
              ) : null}
              {review ? (
                <div className="grid grid-cols-2 gap-2">
                  <ControlButton testId="publish" tone="accent" reason={why("publish")} disabled={pending || !on("publish")} onClick={() => setDialog("publish")}>
                    {copy.live.console.publish}
                  </ControlButton>
                  <ControlButton testId="reopen" reason={why("reopen")} disabled={pending || !on("reopen")} onClick={() => setDialog("reopen")}>
                    {copy.live.console.reopen}
                  </ControlButton>
                </div>
              ) : null}
              {selected.reopened_at && selected.status === "under_review" ? (
                <p data-testid="under-correction" className="rounded-lg border border-beach-outlier bg-beach-bg px-2 py-1 text-body font-semibold">
                  {copy.headLive.underCorrection}
                </p>
              ) : null}
              {cancelling ? (
                <div data-testid="cancel-panel" className="flex flex-col gap-2 rounded-xl border border-beach-crash bg-beach-bg p-2">
                  <label className="flex flex-col gap-1 text-small font-semibold">
                    {T.cancelReason}
                    <input data-testid="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={T.cancelReasonPlaceholder} className="min-h-[48px] rounded-xl border border-beach-border bg-beach-bg px-2 text-body" />
                  </label>
                  <div className="flex gap-2">
                    <ControlButton testId="cancel-confirm" tone="danger" disabled={pending || reason.trim().length < 3} onClick={() => act(T.done.cancel(title), () => cancelHeat(selected.id, reason))}>
                      {T.cancelConfirm}
                    </ControlButton>
                    <ControlButton testId="cancel-back" onClick={() => setCancelling(false)}>
                      {T.cancelBack}
                    </ControlButton>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <ControlButton testId="cancel" tone="danger" reason={why("cancel")} disabled={pending || !on("cancel")} onClick={() => setCancelling(true)}>
                    {T.cancel}
                  </ControlButton>
                  {review ? (
                    <ControlButton testId="rerun" tone="danger" reason={why("rerun")} disabled={pending || !on("rerun")} onClick={() => setDialog("rerun")}>
                      {copy.live.console.rerun}
                    </ControlButton>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <p className="text-body font-medium text-beach-muted">{T.pickHeat}</p>
      )}

      <p data-testid="control-message" data-ok={message?.ok ?? ""} role={message && !message.ok ? "alert" : "status"} aria-live="polite" className={cn("min-h-[1.5rem] text-body font-semibold", message && !message.ok && "rounded-lg border border-beach-failed bg-beach-surface px-2 py-1")}>
        {pending ? T.working : (message?.text ?? "")}
      </p>
      {review && selected && dialog === "publish" ? (
        <PublishDialog
          heatId={selected.id}
          title={title}
          items={review.items}
          canOverride={review.canOverride}
          onChooseOrder={(riders) => {
            setDialog(null);
            review.onChooseOrder(riders);
          }}
          onClose={() => setDialog(null)}
          onDone={(text) => {
            setDialog(null);
            setMessage({ ok: true, text });
            review.onChanged();
          }}
        />
      ) : null}
      {review && selected && dialog === "reopen" ? (
        <ReopenDialog
          heatId={selected.id}
          title={title}
          onClose={() => setDialog(null)}
          onDone={(text) => {
            setDialog(null);
            setMessage({ ok: true, text });
            review.onChanged();
          }}
        />
      ) : null}
      {review && selected && dialog === "rerun" ? (
        <RerunDialog
          heatId={selected.id}
          title={title}
          riders={review.riders}
          onClose={() => setDialog(null)}
          onDone={(newId) => {
            setDialog(null);
            setMessage({ ok: true, text: copy.headLive.rerunDone(title) });
            onSelect(newId);
            review.onChanged();
          }}
        />
      ) : null}
      {review && selected && dialog === "hold" ? (
        <HoldDialog
          heatId={selected.id}
          title={title}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            setMessage({ ok: true, text: copy.headLive.held });
            review.onChanged();
          }}
        />
      ) : null}
    </section>
  );
}
