"use client";

import { useMemo, useState, useTransition } from "react";
import { breakCountdown, computeTimetable, startsOutOfOrder, utcToLocalHHMM, type BreakCountdown, type BreakNone, type Timetable } from "@/lib/engine/schedule";
import { cancelHeat, endHeat, extendBreakAction, holdPlan, pauseHeat, resumeBreakAction, resumeHeat, resumePlanAt, shiftPlan, startHeat, type ActionResult, type PlanActionResult } from "@/lib/live/heat-actions";
import { controlsFor, type Control, type ControlId, type HeatState } from "@/lib/live/head-state";
import type { ReviewProps } from "./heat-control";
import { isLiveHeat } from "@/lib/live/division-pick";
import { activePlanFor, heatTitle, livesFor, timetableOptions, type ActivePlan } from "@/lib/live/run-order";
import { shortTitle } from "@/lib/live/run-line";
import { effectiveStatus, remainingMs } from "@/lib/live/timer";
import type { HeatRow, LiveContext } from "@/lib/live/types";
import type { Json } from "@/lib/supabase/database.types";
import { copy } from "@/lib/ui-copy";

const T = copy.heatControl;
const V = copy.headV2;

/** The heat buttons use the real heat state: a running heat whose time is up counts as ended (the database says the same). */
export function stateOf(h: HeatRow, nowServer: number): HeatState {
  const eff = effectiveStatus({ status: h.status, durationSec: h.duration_sec, startedAt: h.started_at, pausedAt: h.paused_at, pausedTotalSec: h.paused_total_sec }, nowServer);
  if (eff === "cancelled" || eff === "under_review" || eff === "scheduled" || eff === "running" || eff === "paused" || eff === "published") return eff;
  return "ended";
}

export type OrderItem = { heat: HeatRow; time: string | null; held: boolean; problem?: string };
export type GoneItem = { gone: string; problem: string };
export type TimerState = "running" | "paused" | "ended" | "held";
export type DialogKind = "publish" | "reopen" | "rerun" | "hold" | null;

/**
 * Everything the head judge's console does to a heat, in one place, so the laptop layout and the phone's Control tab are two arrangements of the same
 * buttons: the run order (with the real order of the timetable), the selected heat's state and controls, Start (with its out-of-order warning), Hold,
 * Resume at, Shift, the break after a heat (+1 min, Pause break, Resume), Cancel and the dialogs. Every press is a server action on the database's clock.
 */
export function useHeadController(input: { ctx: LiveContext; heats: HeatRow[]; plans: ActivePlan[]; nowServer: number; selectedId: string | null; onSelect: (id: string) => void; onPlanChanged?: (planId: string, hold: Json | null, anchors: Json) => void; review?: ReviewProps; divisionId: string | null }) {
  const { ctx, heats, plans, nowServer, selectedId, onSelect, onPlanChanged, review, divisionId } = input;
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [restart, setRestart] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [startWarning, setStartWarning] = useState<{ heatId: string; text: string } | null>(null);

  const plan = activePlanFor(plans, ctx.event.timezone, nowServer);
  const planId = plan?.id ?? null;
  const lives = useMemo(() => livesFor(ctx, heats, ctx.heatMeta), [ctx, heats]);
  const table: Timetable | null = useMemo(() => (plan ? computeTimetable(plan.plan, lives, timetableOptions(plan, ctx.event.timezone, nowServer)) : null), [plan, lives, ctx.event.timezone, Math.floor(nowServer / 5000)]); // eslint-disable-line react-hooks/exhaustive-deps

  // the run order as the timetable has it, with every heat that is not in it after
  const { order, gone } = useMemo(() => {
    const listed: OrderItem[] = [];
    const missing: GoneItem[] = [];
    if (table) {
      for (const r of table.rows) {
        if (r.kind !== "heat") continue;
        const heat = r.heatId ? heats.find((h) => h.id === r.heatId) : undefined;
        const problem = r.issue ? r.warnings[0] : undefined;
        if (heat) listed.push({ heat, time: r.start, held: r.status === "held", ...(problem ? { problem } : {}) });
        else missing.push({ gone: r.itemId, problem: problem ?? "" });
      }
      const rest = heats.filter((h) => !listed.some((l) => l.heat.id === h.id));
      return { order: [...listed, ...rest.map((heat) => ({ heat, time: null, held: false }))], gone: missing };
    }
    const divisionOrder = new Map(ctx.divisions.map((d, i) => [d.id, i]));
    const sorted = [...heats].sort((a, b) => (divisionOrder.get(a.division_id) ?? 0) - (divisionOrder.get(b.division_id) ?? 0) || a.number - b.number);
    return { order: sorted.map((heat) => ({ heat, time: null, held: false })), gone: missing };
  }, [table, heats, ctx.divisions]);

  const selected = heats.find((h) => h.id === selectedId) ?? null;
  const state = selected ? stateOf(selected, nowServer) : null;
  const alreadyRerun = Boolean(selected && heats.some((h) => h.rerun_of === selected.id));
  const controls = new Map<ControlId, Control>((state ? controlsFor(state, review?.items.length ?? 0, { hasPlan: Boolean(planId), publishOpensList: Boolean(review), alreadyRerun }) : []).map((c) => [c.id, c]));
  const on = (id: ControlId) => Boolean(controls.get(id)?.enabled);
  const why = (id: ControlId) => controls.get(id)?.reason;
  const onHold = Boolean(plan?.plan.hold);
  const title = selected ? heatTitle(ctx, selected) : "";
  const remaining = selected ? remainingMs({ status: selected.status, durationSec: selected.duration_sec, startedAt: selected.started_at, pausedAt: selected.paused_at, pausedTotalSec: selected.paused_total_sec }, nowServer) : 0;
  const timerState: TimerState = onHold && state === "scheduled" ? "held" : state === "paused" ? "paused" : state === "ended" || state === "under_review" || state === "published" || state === "cancelled" ? "ended" : "running";

  // the break after a heat: only while nothing is on the water
  const second = Math.floor(nowServer / 1000);
  const breakInfo: BreakCountdown | BreakNone = useMemo(
    () => (plan ? breakCountdown(plan.plan, lives, { timezone: ctx.event.timezone, eventDay: plan.day, defaults: plan.defaults, now: new Date(second * 1000).toISOString() }) : breakCountdown(null, lives, { timezone: ctx.event.timezone, eventDay: "", defaults: { breakAfterHeatMin: 0, breakAfterRoundMin: 0, readyCallMin: 0 }, now: new Date(second * 1000).toISOString() })),
    [plan, lives, ctx.event.timezone, second],
  );
  const nextTitle = useMemo(() => {
    if (breakInfo.kind !== "break") return "";
    const h = heats.find((x) => x.id === breakInfo.heatId);
    if (!h) return "";
    const own = heats.find((x) => x.id === selectedId)?.division_id ?? divisionId;
    return shortTitle({ division: ctx.divisionTabs.find((d) => d.id === h.division_id)?.name, round: ctx.rounds.find((r) => r.id === h.round_id), heat: h, withDivision: h.division_id !== own });
  }, [breakInfo, heats, ctx.divisionTabs, ctx.rounds, selectedId, divisionId]);

  /** Every press runs one server action and says what happened; a plan change also hands the new hold and pins back so the screen shows them at once. */
  const act = (label: string, run: () => Promise<ActionResult | PlanActionResult>, after?: () => void) =>
    startTransition(async () => {
      setMessage(null);
      const r = await run();
      setMessage(r.ok ? { ok: true, text: label } : { ok: false, text: r.message });
      if (r.ok && "anchors" in r && planId) onPlanChanged?.(planId, r.hold, r.anchors);
      if (r.ok) {
        setCancelling(false);
        setReason("");
        setStartWarning(null);
        after?.();
      }
    });

  /** Start: any heat that has not started, in any order. When it is not the heat the run order expects, ask once (the timetable then re-flows around the real order). */
  const requestStart = () => {
    if (!selected) return;
    const check = startsOutOfOrder(plan?.plan ?? null, lives, selected.id);
    if (check.outOfOrder) {
      const next = heats.find((h) => h.id === check.nextHeatId);
      const text = V.notNext(next ? shortTitle({ division: ctx.divisionTabs.find((d) => d.id === next.division_id)?.name, round: ctx.rounds.find((r) => r.id === next.round_id), heat: next, withDivision: next.division_id !== selected.division_id }) : "");
      setStartWarning({ heatId: selected.id, text });
      return;
    }
    act(T.done.start(title), () => startHeat(selected.id));
  };
  const confirmStart = () => selected && act(T.done.start(title), () => startHeat(selected.id));
  const dismissStart = () => setStartWarning(null);

  const shownWarning = startWarning && startWarning.heatId === selectedId && state === "scheduled" ? startWarning : null;

  return {
    ctx,
    heats,
    plan,
    planId,
    table,
    order,
    gone,
    selected,
    state,
    title,
    remaining,
    timerState,
    on,
    why,
    onHold,
    pending,
    message,
    setMessage,
    restart,
    setRestart,
    cancelling,
    setCancelling,
    reason,
    setReason,
    dialog,
    setDialog,
    act,
    onSelect,
    onPlanChanged,
    review,
    alreadyRerun,
    startWarning: shownWarning,
    requestStart,
    confirmStart,
    dismissStart,
    breakInfo,
    nextTitle,
    nowServer,
    actions: {
      end: () => selected && act(T.done.end(title), () => endHeat(selected.id)),
      pause: () => selected && act(T.done.pause(title), () => pauseHeat(selected.id)),
      resume: () => selected && act(T.done.resume(title), () => resumeHeat(selected.id)),
      hold: () => planId && act(T.done.hold, () => holdPlan(planId)),
      shift: (m: number) => planId && act(T.done.shift(m), () => shiftPlan(planId, m)),
      resumeAt: () => planId && act(T.done.resumeAt(restart), () => resumePlanAt(planId, restart)),
      cancel: () => selected && act(T.done.cancel(title), () => cancelHeat(selected.id, reason)),
      plusOne: () => planId && act(V.breakDone.plusOne, () => extendBreakAction(planId, 1)),
      pauseBreak: () => planId && act(V.breakDone.paused, () => holdPlan(planId)),
      resumeBreak: () => planId && act(V.breakDone.resumed, () => resumeBreakAction(planId)),
    },
    /** Time of the hold, in event time, for the sentence "on hold since …". */
    holdSince: plan?.plan.hold ? utcToLocalHHMM(plan.plan.hold.since, ctx.event.timezone) : null,
    /** A heat that is on the water, if any (the first one found), for the "On now" chip when another division is shown. */
    liveHeat: heats.find((h) => isLiveHeat(h, nowServer)) ?? null,
  };
}

export type HeadController = ReturnType<typeof useHeadController>;
