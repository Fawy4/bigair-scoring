"use client";

import { useMemo, useState, useTransition } from "react";
import { breakCountdown, computeTimetable, startsOutOfOrder, utcToLocalHHMM, type BreakCountdown, type BreakNone, type Timetable } from "@/lib/engine/schedule";
import { extensionSec } from "@/lib/live/extend";
import { abortStart, armHeat, cancelHeat, endHeat, setBreakAction, extendHeat, extendPrestart, holdPlan, pauseHeat, resumeBreakAction, resumeHeat, resumePlanAt, shiftPlan, startHeat, type ActionResult, type PlanActionResult } from "@/lib/live/heat-actions";
import { controlsFor, type Control, type ControlId, type HeatState } from "@/lib/live/head-state";
import type { ReviewProps } from "./heat-control";
import { isLiveHeat } from "@/lib/live/division-pick";
import { activePlanFor, heatTitle, livesFor, timetableOptions, type ActivePlan } from "@/lib/live/run-order";
import { shortRound, shortTitle } from "@/lib/live/run-line";
import { driftOf, plannedTimetable } from "@/lib/schedule/drift";
import { effectiveStatus, formatClock, remainingMs } from "@/lib/live/timer";
import { isArmedNow, nextHeatPart, showsNextHeat } from "@/lib/live/flags";
import { useFlagStrip } from "./use-flag";
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

export type OrderItem = { heat: HeatRow; time: string | null; planned?: string | null; held: boolean; problem?: string };
export type GoneItem = { gone: string; problem: string };
export type TimerState = "running" | "paused" | "ended" | "held";
export type DialogKind = "publish" | "reopen" | "rerun" | "hold" | "reset" | null;

/**
 * Everything the head judge's console does to a heat, in one place, so the laptop layout and the phone's Control tab are two arrangements of the same
 * buttons: the run order (with the real order of the timetable), the selected heat's state and controls, Start (with its out-of-order warning), Hold,
 * Resume at, Shift, the break after a heat (+1 min, Pause break, Resume), Cancel and the dialogs. Every press is a server action on the database's clock.
 */
export function useHeadController(input: { ctx: LiveContext; heats: HeatRow[]; plans: ActivePlan[]; nowServer: number; selectedId: string | null; nextHeatId?: string | null; onSelect: (id: string) => void; onPlanChanged?: (planId: string, hold: Json | null, anchors: Json, items?: Json) => void; onPatchHeat?: (heatId: string, patch: Partial<HeatRow>) => void; review?: ReviewProps; divisionId: string | null }) {
  const { ctx, heats, plans, nowServer, selectedId, nextHeatId = null, onSelect, onPlanChanged, onPatchHeat, review, divisionId } = input;
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [restart, setRestart] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [endFor, setEndFor] = useState<string | null>(null); // the heat whose End heat is waiting for its Confirm
  const [reason, setReason] = useState("");
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [startWarning, setStartWarning] = useState<{ heatId: string; text: string } | null>(null);
  // Flags: the pre-start chosen for the next Start sequence (null = the event's default)
  const [prestart, setPrestart] = useState<number | null>(null);
  // the length typed under "Other…" (null = none typed yet); once typed it is the selected choice
  const [otherSec, setOtherSec] = useState<number | null>(null);
  const setOther = (sec: number) => {
    setOtherSec(sec);
    setPrestart(sec);
  };

  const plan = activePlanFor(plans, ctx.event.timezone, nowServer);
  const planId = plan?.id ?? null;
  const lives = useMemo(() => livesFor(ctx, heats, ctx.heatMeta), [ctx, heats]);
  const table: Timetable | null = useMemo(() => (plan ? computeTimetable(plan.plan, lives, timetableOptions(plan, ctx.event.timezone, nowServer)) : null), [plan, lives, ctx.event.timezone, Math.floor(nowServer / 5000)]); // eslint-disable-line react-hooks/exhaustive-deps

  // the plan as written (nothing started, no clock): the "planned" time of a line, and the drift of the next heat against it
  const planned: Timetable | null = useMemo(() => (plan ? plannedTimetable(plan.plan, lives, timetableOptions(plan, ctx.event.timezone, 0)) : null), [plan, lives, ctx.event.timezone]);
  const drift = useMemo(() => driftOf(planned, table), [planned, table]);

  // the run order as the timetable has it, with every heat that is not in it after
  const { order, gone } = useMemo(() => {
    const listed: OrderItem[] = [];
    const missing: GoneItem[] = [];
    if (table) {
      for (const r of table.rows) {
        if (r.kind !== "heat") continue;
        const heat = r.heatId ? heats.find((h) => h.id === r.heatId) : undefined;
        const problem = r.issue ? r.warnings[0] : undefined;
        if (heat) listed.push({ heat, time: r.start, planned: planned?.rows.find((p) => p.itemId === r.itemId)?.start ?? null, held: r.status === "held", ...(problem ? { problem } : {}) });
        else missing.push({ gone: r.itemId, problem: problem ?? "" });
      }
      const rest = heats.filter((h) => !listed.some((l) => l.heat.id === h.id));
      return { order: [...listed, ...rest.map((heat) => ({ heat, time: null, held: false }))], gone: missing };
    }
    const divisionOrder = new Map(ctx.divisions.map((d, i) => [d.id, i]));
    const sorted = [...heats].sort((a, b) => (divisionOrder.get(a.division_id) ?? 0) - (divisionOrder.get(b.division_id) ?? 0) || a.number - b.number);
    return { order: sorted.map((heat) => ({ heat, time: null, held: false })), gone: missing };
  }, [table, planned, heats, ctx.divisions]);

  const selected = heats.find((h) => h.id === selectedId) ?? null;
  const state = selected ? stateOf(selected, nowServer) : null;
  // The heat the START controls are about. Normally the heat shown; but when the heat shown is over (ended, in review, published) and nothing is on the water, it is the next heat
  // of the run order, so the head judge can raise the next yellow without leaving the review and without a refresh.
  const ctl = useMemo(() => {
    if (selected && stateOf(selected, nowServer) === "scheduled") return selected;
    const onWater = heats.some((h) => isLiveHeat(h, nowServer));
    const next = nextHeatId ? heats.find((h) => h.id === nextHeatId) : undefined;
    if (!onWater && next && stateOf(next, nowServer) === "scheduled") return next;
    return selected;
  }, [selected, heats, nextHeatId, nowServer]);
  const ctlState = ctl ? stateOf(ctl, nowServer) : null;
  const alreadyRerun = Boolean(selected && heats.some((h) => h.rerun_of === selected.id));
  const controls = new Map<ControlId, Control>((state ? controlsFor(state, review?.items.length ?? 0, { hasPlan: Boolean(planId), publishOpensList: Boolean(review), alreadyRerun }) : []).map((c) => [c.id, c]));
  const startControls = new Map<ControlId, Control>((ctlState ? controlsFor(ctlState, 0, { hasPlan: Boolean(planId), publishOpensList: false, alreadyRerun: false }) : []).map((c) => [c.id, c]));
  const on = (id: ControlId) => Boolean((id === "start" ? startControls : controls).get(id)?.enabled);
  const why = (id: ControlId) => (id === "start" ? startControls : controls).get(id)?.reason;
  const onHold = Boolean(plan?.plan.hold);
  const title = selected ? heatTitle(ctx, selected) : "";
  const remaining = selected ? remainingMs({ status: selected.status, durationSec: selected.duration_sec, startedAt: selected.started_at, pausedAt: selected.paused_at, pausedTotalSec: selected.paused_total_sec }, nowServer) : 0;
  const timerState: TimerState = onHold && state === "scheduled" ? "held" : state === "paused" ? "paused" : state === "ended" || state === "under_review" || state === "published" || state === "cancelled" ? "ended" : "running";

  // the break after a heat: only while nothing is on the water
  const second = Math.floor(nowServer / 1000);
  // on a simulation the break is as short as the speed (the speed the last heat ran at)
  const breakScale = useMemo(() => {
    const last = heats.filter((h) => h.ended_at).sort((a, b) => Date.parse(b.ended_at!) - Date.parse(a.ended_at!))[0];
    return Math.max(1, last?.time_scale ?? 1);
  }, [heats]);
  const breakInfo: BreakCountdown | BreakNone = useMemo(
    () => (plan ? breakCountdown(plan.plan, lives, { timezone: ctx.event.timezone, eventDay: plan.day, defaults: plan.defaults, now: new Date(second * 1000).toISOString(), timeScale: breakScale }) : breakCountdown(null, lives, { timezone: ctx.event.timezone, eventDay: "", defaults: { breakAfterHeatMin: 0, breakAfterRoundMin: 0, readyCallMin: 0 }, now: new Date(second * 1000).toISOString() })),
    [plan, lives, ctx.event.timezone, second, breakScale],
  );
  const nextTitle = useMemo(() => {
    if (breakInfo.kind !== "break") return "";
    const h = heats.find((x) => x.id === breakInfo.heatId);
    if (!h) return "";
    const own = heats.find((x) => x.id === selectedId)?.division_id ?? divisionId;
    return shortTitle({ division: ctx.divisionTabs.find((d) => d.id === h.division_id)?.name, round: ctx.rounds.find((r) => r.id === h.round_id), heat: h, withDivision: h.division_id !== own });
  }, [breakInfo, heats, ctx.divisionTabs, ctx.rounds, selectedId, divisionId]);

  // the same name with its division, for the red banner's "Next heat in …" part (it names the heat to anybody who walks past)
  const nextTitleFull = useMemo(() => {
    if (breakInfo.kind !== "break") return "";
    const h = heats.find((x) => x.id === breakInfo.heatId);
    // "Pro Men · R1 · Heat 2": the same words the Flag view and the big screens use (not the run order's short "H2")
    return h ? [ctx.divisionTabs.find((d) => d.id === h.division_id)?.name, shortRound(ctx.rounds.find((r) => r.id === h.round_id)), h.name?.trim() || `Heat ${h.number}${h.number_suffix ?? ""}`].filter(Boolean).join(" · ") : "";
  }, [breakInfo, heats, ctx.divisionTabs, ctx.rounds]);
  /** The break as the run order has it now: from the end of the last heat to the next heat's planned start (warm-up included), as the clock shows it. */
  const lastEndMs = useMemo(() => {
    const ends = heats.filter((h) => h.ended_at).map((h) => Date.parse(h.ended_at!));
    return ends.length ? Math.max(...ends) : null;
  }, [heats]);
  const breakLengthMs = useMemo(() => {
    if (breakInfo.kind !== "break") return null;
    return lastEndMs === null ? null : Math.max(0, Date.parse(breakInfo.startUtc) - lastEndMs);
  }, [breakInfo, lastEndMs]);

  /** Every press runs one server action and says what happened; a plan change also hands the new hold and pins back so the screen shows them at once. */
  const flagsOn = ctx.event.flags.enabled;
  const defaultPrestart = ctx.event.flags.prestartSec;
  const armed = Boolean(ctl && flagsOn && isArmedNow(ctl, nowServer));
  const chosenPrestart = prestart ?? defaultPrestart;
  /** The event's default, "Other…" (its typed value once there is one) and "Start now". A typed value equal to the default simply selects the default. */
  const prestartOptions = useMemo(() => {
    const typed = otherSec !== null && otherSec !== defaultPrestart && otherSec !== 0 ? otherSec : null;
    return [
      { id: "default" as const, sec: defaultPrestart, label: formatClock(defaultPrestart * 1000), selected: chosenPrestart === defaultPrestart },
      { id: "other" as const, sec: typed, label: typed === null ? T.prestartOther : formatClock(typed * 1000), selected: typed !== null && chosenPrestart === typed },
      { id: "now" as const, sec: 0, label: T.prestartNow, selected: chosenPrestart === 0 },
    ];
  }, [defaultPrestart, otherSec, chosenPrestart]);
  const armedFrozen = Boolean(armed && ctl?.armed_paused_at);
  const ctlTitle = ctl ? heatTitle(ctx, ctl) : "";
  const liveHeatRow = heats.find((h) => isLiveHeat(h, nowServer)) ?? null;
  /** The flag strip: about the heat in its pre-start, else the heat on the water, else the heat shown. */
  const flagBase = useFlagStrip(ctx, heats, plans, liveHeatRow ?? selected, nowServer);
  // the red banner keeps its state word ("Finished"); beside it the break counts down to the next heat, from the run order (never starts anything, no horn)
  const flag = useMemo(() => {
    if (!flagBase || breakInfo.kind !== "break" || breakInfo.state === "paused" || !showsNextHeat(flagBase.state)) return flagBase;
    const startMs = Date.parse(breakInfo.startUtc);
    const part = nextHeatPart({ startMs, title: nextTitleFull, est: utcToLocalHHMM(startMs, ctx.event.timezone) }, nowServer);
    return { ...flagBase, words: flagBase.state.label, nextPart: part };
  }, [flagBase, breakInfo, nextTitleFull, nowServer, ctx.event.timezone]);

  /**
   * Every press runs one server action. The screen answers at once with a guess of what the press does (`guess`, fields of the selected heat), then takes the row the
   * database answered with; a refusal puts the guessed fields back. The stream confirms it a moment later and changes nothing.
   */
  const act = (label: string, run: () => Promise<ActionResult | PlanActionResult>, after?: () => void, guess?: Partial<HeatRow>, targetId: string | null = selectedId) => {
    const id = targetId;
    const before = id ? heats.find((h) => h.id === id) : undefined;
    // the guess goes on the screen first, outside the transition: an update made inside an async transition is held back until the whole action has finished
    if (guess && id) onPatchHeat?.(id, guess);
    startTransition(async () => {
      setMessage(null);
      const r = await run();
      if (r.ok && "heat" in r && r.heat && id) onPatchHeat?.(id, r.heat);
      if (!r.ok && guess && before && id) onPatchHeat?.(id, Object.fromEntries(Object.keys(guess).map((k) => [k, before[k as keyof HeatRow]])) as Partial<HeatRow>);
      setMessage(r.ok ? { ok: true, text: label } : { ok: false, text: r.message });
      if (r.ok && "anchors" in r && planId) onPlanChanged?.(planId, r.hold, r.anchors, r.items);
      if (r.ok) {
        setCancelling(false);
        setReason("");
        setStartWarning(null);
        after?.();
      }
    });
  };
  const stamp = new Date(nowServer).toISOString();

  /** Start: any heat that has not started, in any order. When it is not the heat the run order expects, ask once (the timetable then re-flows around the real order). */
  const requestStart = () => {
    if (!ctl) return;
    const check = startsOutOfOrder(plan?.plan ?? null, lives, ctl.id);
    if (check.outOfOrder) {
      const next = heats.find((h) => h.id === check.nextHeatId);
      const text = V.notNext(next ? shortTitle({ division: ctx.divisionTabs.find((d) => d.id === next.division_id)?.name, round: ctx.rounds.find((r) => r.id === next.round_id), heat: next, withDivision: next.division_id !== ctl.division_id }) : "");
      setStartWarning({ heatId: ctl.id, text });
      return;
    }
    startNow();
  };
  /** Start heat (flags off), or Start sequence (flags on: the yellow for the chosen pre-start; "Start now" skips it). */
  const startNow = () => {
    if (!ctl) return;
    if (!flagsOn) return act(T.done.start(ctlTitle), () => startHeat(ctl.id), undefined, undefined, ctl.id); // no guess: the plain Start is shown from the database's own answer
    if (chosenPrestart === 0) return act(T.done.start(ctlTitle), () => armHeat(ctl.id, 0), undefined, { armed_at: stamp, prestart_sec: 0, armed_paused_at: null }, ctl.id);
    act(T.done.arm(ctlTitle, formatClock(chosenPrestart * 1000)), () => armHeat(ctl.id, chosenPrestart), undefined, { armed_at: stamp, prestart_sec: chosenPrestart, armed_paused_at: null }, ctl.id);
  };
  const confirmStart = () => startNow();
  const dismissStart = () => setStartWarning(null);

  const shownWarning = startWarning && ctl && startWarning.heatId === ctl.id && ctlState === "scheduled" ? startWarning : null;

  return {
    ctx,
    heats,
    plan,
    planId,
    table,
    order,
    gone,
    selected,
    ctl,
    ctlTitle,
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
    confirmingEnd: endFor !== null && endFor === selectedId,
    setConfirmingEnd: (ask: boolean) => setEndFor(ask ? selectedId : null),
    reason,
    setReason,
    dialog,
    setDialog,
    act,
    onSelect,
    onPlanChanged,
    patchHeat: onPatchHeat,
    review,
    alreadyRerun,
    startWarning: shownWarning,
    requestStart,
    confirmStart,
    flag,
    flagsOn,
    armed,
    prestartOptions,
    chosenPrestart,
    setPrestart,
    setOther,
    armedFrozen,
    dismissStart,
    breakInfo,
    nextTitle,
    breakLengthMs,
    lastEndMs,
    nowServer,
    drift,
    actions: {
      /** Green at once, during the yellow. */
      startNowDuringYellow: () => ctl && act(T.done.startNow(ctlTitle), () => startHeat(ctl.id), undefined, undefined, ctl.id),
      abort: () => ctl && act(T.done.abort(ctlTitle), () => abortStart(ctl.id), undefined, { armed_at: null, prestart_sec: null, armed_paused_at: null }, ctl.id),
      /** End heat asks once (the panel under the buttons); this is the confirmed press. No guess: ending a heat is shown from the database's own answer. */
      end: () => selected && act(T.done.end(title), () => endHeat(selected.id, reason), () => setEndFor(null)),
      /** "+1 min" on the yellow: exactly one more minute, as often as needed. */
      extend: () => ctl && act(T.done.extend(ctlTitle), () => extendPrestart(ctl.id), undefined, { prestart_sec: (ctl.prestart_sec ?? 0) + 60 }, ctl.id),
      /** "+1 min" on a running heat: the server adds the minute; the head's own screen shows it at once and then takes the database's row. */
      extendHeat: () => selected && act(T.done.extendHeat(title), () => extendHeat(selected.id), undefined, { duration_sec: selected.duration_sec + extensionSec(selected.time_scale) }),
      pause: () => { const t = armed ? ctl : selected; return t && act(T.done.pause(armed ? ctlTitle : title), () => pauseHeat(t.id), undefined, armed && !armedFrozen ? { armed_paused_at: stamp } : { status: "paused", paused_at: stamp }, t.id); },
      resume: () => { const t = armedFrozen ? ctl : selected; return t && act(T.done.resume(armedFrozen ? ctlTitle : title), () => resumeHeat(t.id), undefined, armedFrozen ? { armed_paused_at: null } : { status: "running", paused_at: null, paused_total_sec: t.paused_total_sec + (t.paused_at ? Math.max(0, Math.round((nowServer - Date.parse(t.paused_at)) / 1000)) : 0) }, t.id); },
      hold: () => planId && act(T.done.hold, () => holdPlan(planId)),
      shift: (m: number) => planId && act(T.done.shift(m), () => shiftPlan(planId, m)),
      resumeAt: () => planId && act(T.done.resumeAt(restart), () => resumePlanAt(planId, restart)),
      cancel: () => selected && act(T.done.cancel(title), () => cancelHeat(selected.id, reason)),
      /** The break controls: the change IS the run order's break for this gap (the next heat's planned start moves on every screen), to the second. */
      breakPlusOne: () => planId && act(V.breakDone.plusOne, () => setBreakAction(planId, { kind: "add", minutes: 1 })),
      breakSet: (seconds: number) => planId && act(V.breakDone.set(formatClock(seconds * 1000)), () => setBreakAction(planId, { kind: "length", seconds })),
      breakAdd: (seconds: number) => planId && act(V.breakDone.added(formatClock(seconds * 1000)), () => setBreakAction(planId, { kind: "add", minutes: seconds / 60 })),
      pauseBreak: () => planId && act(V.breakDone.paused, () => holdPlan(planId)),
      resumeBreak: () => planId && act(V.breakDone.resumed, () => resumeBreakAction(planId)),
    },
    /** Time of the hold, in event time, for the sentence "on hold since …". */
    holdSince: plan?.plan.hold ? utcToLocalHHMM(plan.plan.hold.since, ctx.event.timezone) : null,
    /** A heat that is on the water, if any (the first one found), for the "On now" chip when another division is shown. */
    liveHeat: liveHeatRow,
  };
}

export type HeadController = ReturnType<typeof useHeadController>;
