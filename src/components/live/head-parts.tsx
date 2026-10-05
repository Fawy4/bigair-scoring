"use client";

import { useState } from "react";
import { Check, Clock, Volume2, VolumeX, Wind } from "lucide-react";
import { HoldDialog, PublishDialog, ReopenDialog, RerunDialog, ResetHeatDialog } from "./head-dialogs";
import { ClockText } from "@/components/clock-text";
import { DriftBadge } from "@/components/drift-badge";
import { FlagStrip } from "./flag-strip";
import { HeatTimer } from "./heat-timer";
import { Pill } from "./pill";
import { setHeatPublicLive, setPublishHold } from "@/lib/live/head-actions";
import { type ActionResult } from "@/lib/live/heat-actions";
import { nextHeatInOrder, utcToLocalHHMM } from "@/lib/engine/schedule";
import { WindCallControl } from "@/components/wind-call-control";
import { runLine, shortHeat } from "@/lib/live/run-line";
import { heatLabel, livesFor } from "@/lib/live/run-order";
import { formatClock } from "@/lib/live/timer";
import { parseBreak } from "@/lib/live/break-input";
import { parsePrestart } from "@/lib/live/prestart-input";
import { resetHeatControl, type ControlId } from "@/lib/live/head-state";
import type { FixTarget } from "@/lib/live/publish-checklist";
import { pausedByWords } from "@/lib/live/paused-by";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
import { stateOf, type HeadController, type OrderItem } from "./use-head-controller";

const T = copy.heatControl;
const V = copy.headV2;
const HL = copy.headLive;

/** A heat-control button. `compact` is the laptop's top bar (the reason goes to the line under the bar and to assistive technology); otherwise the reason is written under the button. */
export function Btn({ children, onClick, disabled, tone = "plain", testId, reason, compact = false, size = "tap", className, pressed }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: "plain" | "accent" | "danger"; testId: string; reason?: string; compact?: boolean; size?: "tap" | "bar"; className?: string; pressed?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <button
        type="button"
        data-testid={testId}
        disabled={disabled}
        aria-describedby={disabled && reason ? `why-${testId}` : undefined}
        aria-pressed={pressed}
        onClick={onClick}
        className={cn(
          "inline-flex items-center justify-center gap-1 rounded-xl border px-3 text-body font-semibold",
          pressed ? "border-2 border-beach-accent" : "",
          size === "bar" ? "min-h-bar" : "min-h-tap",
          disabled ? "border-beach-line bg-beach-surface text-beach-muted" : tone === "accent" ? "border-beach-accent bg-beach-accent text-beach-on-accent" : tone === "danger" ? "border-beach-crash bg-beach-bg text-beach-ink" : "border-beach-border bg-beach-bg text-beach-ink",
          className,
        )}
      >
        {children}
      </button>
      {disabled && reason ? (
        <p id={`why-${testId}`} data-testid={`why-${testId}`} className={cn(compact ? "sr-only" : "text-small font-medium text-beach-muted")}>
          {reason}
        </p>
      ) : null}
    </div>
  );
}

/** One division at a time (Console v2 §1). A small live dot, with its word for people who cannot see colour, marks another division with a heat running or paused. */
export function DivisionTabs({ divisions, divisionId, liveIds, onPick }: { divisions: Array<{ id: string; name: string }>; divisionId: string | null; liveIds: Set<string>; onPick: (id: string) => void }) {
  return (
    <div role="group" aria-label={V.divisionsLabel} data-testid="division-tabs" className="flex flex-wrap items-center gap-1.5">
      {divisions.map((d) => {
        const live = liveIds.has(d.id);
        return (
          <button
            key={d.id}
            type="button"
            data-testid="division-tab"
            data-division={d.id}
            data-live={live}
            aria-pressed={divisionId === d.id}
            onClick={() => onPick(d.id)}
            className={cn("inline-flex min-h-tap items-center gap-1.5 whitespace-normal break-words rounded-xl border px-3 text-left text-body font-semibold", divisionId === d.id ? "border-beach-accent bg-beach-accent text-beach-on-accent" : "border-beach-border bg-beach-bg text-beach-ink")}
          >
            {d.name}
            {live ? (
              <>
                <span data-testid="division-live-dot" aria-hidden className="size-2.5 shrink-0 rounded-full bg-beach-live ring-2 ring-beach-bg" />
                <span className="sr-only">{V.liveDot(d.name)}</span>
              </>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Start is the head judge's tap and nothing starts by itself. Out of order: one warning, then Start anyway. */
export function StartWarning({ c }: { c: HeadController }) {
  if (!c.startWarning) return null;
  return (
    <div role="alert" data-testid="start-warning" className="flex flex-wrap items-center gap-2 rounded-card border border-beach-outlier bg-beach-bg p-2">
      <p className="min-w-0 flex-1 text-body font-semibold">{c.startWarning.text}</p>
      <Btn testId="start-anyway" tone="accent" disabled={c.pending} onClick={c.confirmStart}>
        {V.startAnyway}
      </Btn>
      <Btn testId="start-keep" onClick={c.dismissStart}>
        {V.startKeep}
      </Btn>
    </div>
  );
}

/** "Next: R1 · H3 · starts in 4:30" after a heat has ended, with "+1 min" and "Pause break". Nothing starts by itself. Hidden while a heat is on; with no run order, one line says why. */
export function BreakStrip({ c }: { c: HeadController }) {
  const info = c.breakInfo;
  if (info.kind === "none") {
    const line = V.breakNone[info.reason];
    return line ? (
      <p data-testid="break-reason" className="text-small font-medium text-beach-muted">
        {line}
      </p>
    ) : null;
  }
  const late = info.state === "due" ? formatClock(info.lateMs) : "";
  const text = info.state === "counting" ? V.breakNext(c.nextTitle, formatClock(info.remainingMs)) : info.state === "due" ? V.breakDue(c.nextTitle, late) : V.breakPaused(c.nextTitle, formatClock(info.remainingMs));
  return (
    <div data-testid="break-strip" data-state={info.state} className="flex flex-wrap items-center gap-2 rounded-card border border-beach-line bg-beach-surface px-2 py-1">
      <Clock aria-hidden className="size-4 shrink-0" />
      <p data-testid="break-text" aria-live="off" className="min-w-0 flex-1 text-body font-semibold tabular-nums">
        {text}
      </p>
      {info.state === "paused" ? (
        <Btn testId="break-resume" tone="accent" disabled={c.pending || !c.planId} onClick={c.actions.resumeBreak}>
          {V.resumeBreak}
        </Btn>
      ) : (
        <>
          <Btn testId="break-pause" disabled={c.pending || !c.planId} onClick={c.actions.pauseBreak}>
            {V.pauseBreak}
          </Btn>
        </>
      )}
    </div>
  );
}

/** The heat's name, the timer large (48 px) and Start / Pause / Resume / End right beside it. `withSound` adds "Sound on" (the laptop; the phone has it under Details). */
export function TimerBar({ c, withSound, onSoundToggle, soundOn }: { c: HeadController; withSound?: boolean; onSoundToggle?: () => void; soundOn?: boolean }) {
  const { selected, state } = c;
  const live = state === "running" || state === "paused";
  const first = (["start", "end"] as ControlId[]).find((id) => !c.on(id));
  const reason = first ? c.why(first) : undefined;
  return (
    <div data-testid="selected-heat" data-state={state ?? ""} className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-col">
          <p data-testid="heat-name" className="whitespace-normal break-words text-name font-semibold">
            {selected ? c.title : V.noHeat}
          </p>
          {selected ? <Pill tone="ink" className="self-start">{T.status[selected.status === "under_review" ? "under_review" : state === "ended" && selected.status === "running" ? "ended" : (state ?? "")] ?? state}</Pill> : null}
          {pausedByWords(selected) ? (
            <p data-testid="paused-by" className="text-small font-semibold text-beach-muted">
              {pausedByWords(selected)}
            </p>
          ) : null}
        </div>
        <ClockText timezone={c.ctx.event.timezone} nowMs={c.nowServer} />
        <DriftBadge drift={c.drift} />
        {/* the banner has its own full-width line: nothing sits beside it or on top of it, so its words (state, break countdown, next heat) are never cut */}
        {c.flag ? <FlagStrip model={c.flag} size="head" className="w-full basis-full" /> : selected ? <HeatTimer remainingMs={c.remaining} state={c.timerState} size="head" /> : null}
        {selected && state !== "cancelled" ? (
          <div className="flex w-full basis-full flex-wrap items-center gap-2">
            {c.ctl && c.ctl.id !== selected.id && c.on("start") ? (
              <span data-testid="start-target" className="text-small font-semibold text-beach-muted">
                {T.startNext(c.ctlTitle)}
              </span>
            ) : null}
            {c.flagsOn && !c.armed && c.on("start") ? <PrestartChoice c={c} /> : null}
            {c.armed ? (
              <>
                <Btn compact size="bar" testId="start-now" tone="accent" disabled={c.pending} onClick={c.actions.startNowDuringYellow}>
                  {T.startNow}
                </Btn>
                <Btn compact size="bar" testId="extend-prestart" disabled={c.pending} onClick={c.actions.extend}>
                  {T.plusOneMin}
                </Btn>
                <Btn compact size="bar" testId="abort-start" disabled={c.pending} onClick={c.actions.abort}>
                  {T.abort}
                </Btn>
              </>
            ) : (
              <Btn compact size="bar" testId="start" tone="accent" className="px-5" reason={c.why("start")} disabled={c.pending || !c.on("start")} onClick={c.requestStart}>
                {c.flagsOn ? T.startSequence : T.start}
              </Btn>
            )}
            {state === "running" && !c.armed ? (
              <Btn compact size="bar" testId="extend-heat" disabled={c.pending} onClick={c.actions.extendHeat}>
                {T.plusOneMin}
              </Btn>
            ) : null}
            {state === "paused" || c.armedFrozen ? (
              <Btn compact size="bar" testId="resume" reason={c.why("resume")} disabled={c.pending || (!c.on("resume") && !c.armedFrozen)} onClick={c.actions.resume}>
                {T.resume}
              </Btn>
            ) : (
              <Btn compact size="bar" testId="pause" reason={c.why("pause")} disabled={c.pending || (!c.on("pause") && !c.armed)} onClick={c.actions.pause}>
                {T.pause}
              </Btn>
            )}
            <Btn compact size="bar" testId="end" reason={c.why("end")} disabled={c.pending || !c.on("end")} onClick={() => { c.setReason(""); c.setConfirmingEnd(true); }}>
              {T.end}
            </Btn>
            {!c.armed ? <BreakChoice c={c} /> : null}
          </div>
        ) : null}
        {withSound && onSoundToggle ? (
          <button type="button" data-testid="sound-toggle" aria-pressed={!!soundOn} onClick={onSoundToggle} className="inline-flex min-h-tap items-center gap-1 rounded-xl border border-beach-border bg-beach-bg px-3 text-small font-semibold text-beach-ink">
            {soundOn ? <Volume2 aria-hidden className="size-4" /> : <VolumeX aria-hidden className="size-4" />}
            {soundOn ? copy.live.timer.soundOn : copy.live.timer.soundOff}
          </button>
        ) : null}
      </div>
      {selected && c.confirmingEnd && c.on("end") ? (
        <div data-testid="end-panel" role="group" aria-label={T.endQuestion} className="flex flex-col gap-1.5 rounded-xl border border-beach-border bg-beach-surface p-2">
          <p className="text-body font-semibold">{T.endQuestion}</p>
          <label className="flex flex-col gap-1 text-small font-semibold">
            {T.endReason}
            <input data-testid="end-reason" value={c.reason} onChange={(e) => c.setReason(e.target.value)} className="min-h-tap rounded-xl border border-beach-border bg-beach-bg px-3 text-body font-semibold" />
          </label>
          <div className="flex gap-1.5">
            <Btn testId="end-confirm" tone="danger" disabled={c.pending} onClick={c.actions.end}>
              {T.endConfirm}
            </Btn>
            <Btn testId="end-cancel" onClick={() => c.setConfirmingEnd(false)}>
              {T.endCancel}
            </Btn>
          </div>
        </div>
      ) : null}
      {selected && state !== "cancelled" && !live && reason ? (
        <p data-testid="why-line" className="text-small font-medium text-beach-muted">
          {reason}
        </p>
      ) : null}
      {selected && state === "cancelled" ? <CancelledNote c={c} /> : null}
    </div>
  );
}

/**
 * "Break:" on its own line under the red banner (the banner is never squeezed or covered), laid out like the Pre-start group but smaller: the break as the run order has it now
 * (ticked, with its length), "+1 min", "+ Other…" (adds the typed time, like +1 min) and "Set length…" (the whole break, counted from the end of the last heat). A small field opens
 * under the buttons for the last two, one at a time. Each press changes the REAL break (the run order's), so the next heat's planned start moves on every screen; nothing starts.
 */
export function BreakChoice({ c }: { c: HeadController }) {
  const info = c.breakInfo;
  const [mode, setMode] = useState<"add" | "set" | null>(null);
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  if (info.kind !== "break" || info.state === "paused" || c.breakLengthMs === null) return null;
  const apply = () => {
    const r = parseBreak(text);
    if (!r.ok || (mode === "add" && r.sec <= 0)) return setBad(true);
    setBad(false);
    setMode(null);
    setText("");
    if (mode === "add") c.actions.breakAdd(r.sec);
    else c.actions.breakSet(r.sec);
  };
  const toggle = (m: "add" | "set") => {
    setBad(false);
    setText("");
    setMode((cur) => (cur === m ? null : m));
  };
  const id = mode === "add" ? "break-add" : "break-set";
  return (
    <div data-testid="break-choice" role="group" aria-label={V.breakGroup} className="flex w-full basis-full flex-col gap-1 rounded-xl border border-beach-line bg-beach-surface px-2 py-1">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className="text-small font-semibold text-beach-muted">{V.breakGroup}</span>
        <span data-testid="break-length" aria-current="true" className="inline-flex min-h-tap items-center gap-1 rounded-lg border-2 border-beach-accent bg-beach-bg px-2 text-small font-semibold tabular-nums text-beach-ink">
          <Check aria-hidden className="size-3.5" />
          {V.breakPlanned(formatClock(c.breakLengthMs))}
        </span>
        <Btn compact size="bar" testId="break-plus-one" disabled={c.pending || !c.planId} onClick={c.actions.breakPlusOne}>
          {T.plusOneMin}
        </Btn>
        <Btn compact size="bar" testId="break-add" pressed={mode === "add"} disabled={c.pending || !c.planId} onClick={() => toggle("add")}>
          {V.breakAdd}
        </Btn>
        <Btn compact size="bar" testId="break-set" pressed={mode === "set"} disabled={c.pending || !c.planId} onClick={() => toggle("set")}>
          {V.breakOther}
        </Btn>
      </div>
      {mode ? (
        <div className="flex flex-wrap items-center gap-1">
          <label className="text-small font-semibold text-beach-muted" htmlFor={`${id}-input`}>
            {mode === "add" ? V.breakAddLabel : V.breakOtherLabel}
          </label>
          <input
            id={`${id}-input`}
            data-testid={`${id}-input`}
            inputMode="numeric"
            autoFocus
            value={text}
            placeholder="2:30"
            aria-invalid={bad}
            onChange={(e) => {
              setText(e.target.value);
              setBad(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                apply();
              }
            }}
            className="min-h-tap w-24 rounded-lg border border-beach-border bg-beach-bg px-2 text-small font-semibold tabular-nums"
          />
          <Btn compact size="bar" testId={`${id}-apply`} disabled={c.pending || !c.planId} onClick={apply}>
            {mode === "add" ? V.breakAddApply : V.breakOtherSet}
          </Btn>
          {bad ? (
            <p role="alert" data-testid={`${id}-error`} className="w-full text-small font-semibold">
              {mode === "add" ? V.breakAddBad : V.breakOtherBad}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The pre-start for the next Start heat sequence, written as a setting you pick first: the label "Pre-start:", then the event's default, "Other…" (a small field for
 * any length from 0:10 to 15:00, typed as 1:30 or whole minutes; once typed it is the selected choice) and "Start now" (no yellow). The chosen one carries a tick and a
 * heavier border, so it never depends on colour alone. It sits apart from the primary button, which is the only thing that starts anything.
 */
export function PrestartChoice({ c }: { c: HeadController }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  const apply = () => {
    const r = parsePrestart(text);
    if (!r.ok) return setBad(true);
    setBad(false);
    setOpen(false);
    c.setOther(r.sec);
  };
  return (
    <div data-testid="prestart-choice" role="radiogroup" aria-label={T.prestartLabel} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-beach-line bg-beach-surface px-2 py-1">
      <span id="prestart-label" className="text-small font-semibold text-beach-muted">
        {T.prestartGroup}
      </span>
      {c.prestartOptions.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.selected}
          data-testid={o.id === "other" ? "prestart-other" : `prestart-${o.sec}`}
          onClick={() => {
            if (o.id === "other") {
              setOpen((v) => !v);
              if (o.sec !== null) c.setPrestart(o.sec);
            } else {
              setOpen(false);
              c.setPrestart(o.sec as number);
            }
          }}
          className={cn("inline-flex min-h-tap items-center gap-1 rounded-lg border-2 px-3 text-small font-semibold tabular-nums", o.selected ? "border-beach-accent bg-beach-bg text-beach-ink" : "border-transparent bg-transparent text-beach-muted")}
        >
          {o.selected ? <Check aria-hidden className="size-4" /> : null}
          {o.label}
        </button>
      ))}
      {open ? (
        <div className="flex flex-wrap items-center gap-1">
          <label className="sr-only" htmlFor="prestart-other-input">
            {T.prestartOtherLabel}
          </label>
          <input
            id="prestart-other-input"
            data-testid="prestart-other-input"
            inputMode="numeric"
            autoFocus
            value={text}
            placeholder={T.prestartOtherPlaceholder}
            aria-invalid={bad}
            aria-describedby={bad ? "prestart-other-error" : undefined}
            onChange={(e) => {
              setText(e.target.value);
              setBad(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                apply();
              }
            }}
            className="min-h-tap w-24 rounded-lg border border-beach-border bg-beach-bg px-2 text-body tabular-nums"
          />
          <Btn testId="prestart-other-set" compact onClick={apply}>
            {T.prestartOtherSet}
          </Btn>
        </div>
      ) : null}
      {bad ? (
        <p id="prestart-other-error" role="alert" data-testid="prestart-other-error" className="basis-full text-small font-semibold">
          {copy.liveErrors.codes.BAD_PRESTART()}
        </p>
      ) : null}
    </div>
  );
}

/** A cancelled heat: it cannot be started, and says where its re-run is (or offers Re-run). */
export function CancelledNote({ c }: { c: HeadController }) {
  const again = c.selected ? c.heats.find((h) => h.rerun_of === c.selected!.id) : undefined;
  return (
    <p data-testid="cancelled-note" className="rounded-lg border border-beach-crash bg-beach-bg px-2 py-1 text-body font-semibold">
      {again ? HL.cancelledRerun(heatLabel(again)) : T.status.cancelled}
    </p>
  );
}

function OrderRow({ c, entry, nextId, divisionName }: { c: HeadController; entry: OrderItem; nextId: string | null; divisionName?: string }) {
  const { heat, time, planned, held, problem } = entry;
  const st = stateOf(heat, c.nowServer);
  const word = st === "scheduled" ? null : (T.status[st === "ended" && heat.status === "under_review" ? "under_review" : st] ?? st);
  const round = c.ctx.rounds.find((r) => r.id === heat.round_id);
  const line = runLine({ round, heat, startedHhmm: heat.started_at ? utcToLocalHHMM(heat.started_at, c.ctx.event.timezone) : null, estimatedHhmm: time, plannedHhmm: planned ?? null, held, statusWord: word });
  const selectedHere = c.selected?.id === heat.id;
  const isNext = nextId === heat.id && st === "scheduled";
  return (
    <li>
      <button
        type="button"
        data-testid="order-row"
        data-heat={heat.id}
        data-state={st}
        data-next={isNext}
        aria-pressed={selectedHere}
        title={divisionName}
        onClick={() => c.onSelect(heat.id)}
        className={cn("flex min-h-row w-full flex-wrap items-center gap-x-2 gap-y-0.5 border-l-4 px-2 py-1 text-left text-body", isNext ? "border-beach-accent bg-beach-surface" : "border-transparent", selectedHere ? "font-bold" : "font-semibold")}
      >
        <span className="min-w-0 whitespace-normal break-words">{line}</span>
        {isNext ? <Pill tone="accent">{V.nextMark}</Pill> : null}
      </button>
      {problem ? (
        <p role="note" data-testid="order-problem" className="px-2 pb-1 text-small font-semibold">
          {T.rowProblem(problem)}
        </p>
      ) : null}
    </li>
  );
}

/** The run order of one division, one short line per heat, the next heat marked; "Other divisions" folded below. A run-order row whose heat is gone is shown first, as before. */
export function RunOrderList({ c, divisionId }: { c: HeadController; divisionId: string | null }) {
  const { ctx } = c;
  const divisionName = ctx.divisionTabs.find((d) => d.id === divisionId)?.name ?? "";
  const lives = livesFor(ctx, c.heats, ctx.heatMeta);
  const nextId = c.plan ? (nextHeatInOrder(c.plan.plan, lives)?.heatId ?? null) : null;
  const rowsOf = (id: string) => c.order.filter((e) => e.heat.division_id === id);
  const mine = divisionId ? rowsOf(divisionId) : [];
  const others = ctx.divisionTabs.filter((d) => d.id !== divisionId);
  const [open, setOpen] = useState(false);
  return (
    <section data-testid="heat-control" aria-label={T.heading} className="flex flex-col gap-1.5">
      <h2 className="whitespace-normal break-words text-heading font-semibold text-beach-muted">{V.runOrder(divisionName)}</h2>
      {!c.plan && c.heats.length > 0 ? <p className="text-small font-medium text-beach-muted">{T.noPlan}</p> : null}
      {c.order.length === 0 && c.gone.length === 0 ? (
        <p data-testid="no-heats" className="text-body font-medium text-beach-muted">
          {T.empty}
        </p>
      ) : (
        <ol data-testid="run-order" className="flex flex-col divide-y divide-beach-line rounded-xl border border-beach-line bg-beach-bg">
          {c.gone.map((g) => (
            <li key={`gone-${g.gone}`} data-testid="order-gone" className="flex min-h-row flex-col justify-center gap-0.5 px-2 py-1">
              <span className="text-body font-semibold text-beach-muted">{T.goneRow}</span>
              <span role="note" data-testid="order-problem" className="text-small font-semibold">
                {T.rowProblem(g.problem)}
              </span>
            </li>
          ))}
          {mine.map((e) => (
            <OrderRow key={e.heat.id} c={c} entry={e} nextId={nextId} />
          ))}
        </ol>
      )}
      <details data-testid="other-divisions" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)} className="rounded-xl border border-beach-line bg-beach-bg">
        <summary className="min-h-tap cursor-pointer list-none px-2 py-1.5 text-body font-semibold">{V.otherDivisions}</summary>
        {others.length === 0 ? <p className="px-2 pb-2 text-small font-medium text-beach-muted">{V.otherDivisionsNone}</p> : null}
        {others.map((d) => (
          <div key={d.id} className="flex flex-col">
            <p className="whitespace-normal break-words px-2 pt-1 text-small font-semibold text-beach-muted">{d.name}</p>
            <ol className="flex flex-col divide-y divide-beach-line">
              {rowsOf(d.id).map((e) => (
                <OrderRow key={e.heat.id} c={c} entry={e} nextId={nextId} divisionName={d.name} />
              ))}
            </ol>
          </div>
        ))}
      </details>
    </section>
  );
}

/** Hold / Resume at / Shift +5 / +10, small, under the run order. They work on the whole run order, so they are on while a heat is on and between heats. */
export function TimingButtons({ c }: { c: HeadController }) {
  const between = c.breakInfo.kind === "break";
  const ok = (id: ControlId) => c.on(id) || (between && Boolean(c.planId) && (id === "hold" || id === "shift5" || id === "shift10"));
  const reason = (id: ControlId) => c.why(id);
  const { plan } = c;
  return (
    <div data-testid="timing-buttons" className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-start gap-1.5">
        <Btn compact testId="hold" reason={reason("hold")} disabled={c.pending || !ok("hold") || c.onHold} onClick={c.actions.hold}>
          {V.hold}
        </Btn>
        {[5, 10].map((m) => (
          <Btn compact key={m} testId={`shift${m}`} reason={reason(m === 5 ? "shift5" : "shift10")} disabled={c.pending || !ok(m === 5 ? "shift5" : "shift10") || c.onHold} onClick={() => c.actions.shift(m)}>
            {V.shiftLabel(m)}
          </Btn>
        ))}
      </div>
      {c.onHold && plan?.plan.hold ? (
        <div data-testid="hold-panel" className="flex flex-col gap-1.5 rounded-xl border border-beach-border bg-beach-bg p-2">
          <p className="text-body font-semibold">{plan.plan.hold.reason ? T.onHoldReason(c.holdSince ?? "", plan.plan.hold.reason) : T.onHold(c.holdSince ?? "")}</p>
          <div className="flex flex-wrap items-end gap-1.5">
            <label className="flex flex-col gap-1 text-small font-semibold">
              {T.restartTime}
              <input data-testid="restart-time" type="time" value={c.restart} onChange={(e) => c.setRestart(e.target.value)} className="min-h-tap rounded-xl border border-beach-border bg-beach-bg px-2 text-body" />
            </label>
            <Btn testId="resume-at" tone="accent" disabled={c.pending || !c.restart || !c.planId} onClick={c.actions.resumeAt}>
              {V.resumeAt}
            </Btn>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The wind call is one button that opens a small panel (the same control the organiser's dashboard uses), never three permanent blocks. */
export function WindButton({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" data-testid="wind-button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex min-h-tap items-center justify-center gap-1.5 self-start rounded-xl border border-beach-border bg-beach-bg px-3 text-body font-semibold text-beach-ink">
        <Wind aria-hidden className="size-4" />
        {V.windButton}
      </button>
      {open ? (
        <div data-testid="wind-panel" className="flex flex-col gap-1.5">
          <WindCallControl eventId={eventId} />
          <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-tap items-center justify-center self-start rounded-xl border border-beach-border bg-beach-bg px-3 text-body font-semibold text-beach-ink">
            {V.windClose}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** The live-score switch of the heat (follow the division / on / off) and the held final's "Hold result back". For the public pages; not needed to run the heat, so on the laptop it is behind "More". Releasing a held result is the button beside Publish. */
export function VisibilityBox({ c }: { c: HeadController }) {
  const { selected, state, review } = c;
  if (!selected || !state || !review || state === "scheduled" || state === "cancelled") return null;
  return (
    <section data-testid="visibility" aria-label={HL.visibilityHeading} className="flex flex-col gap-1.5 rounded-xl border border-beach-line bg-beach-bg p-2">
      <p className="text-small font-semibold text-beach-muted">{HL.liveHeading}</p>
      <div role="group" aria-label={HL.liveHeading} className="grid grid-cols-3 gap-1.5">
        {([[null, HL.liveFollow], [true, HL.liveOn], [false, HL.liveOff]] as Array<[boolean | null, string]>).map(([v, text]) => (
          <button
            key={String(v)}
            type="button"
            data-testid={`live-${v === null ? "follow" : v ? "on" : "off"}`}
            aria-pressed={selected.public_live === v}
            disabled={c.pending}
            onClick={() => c.act(HL.saved, async () => (await setHeatPublicLive(selected.id, v)) as ActionResult, review.onChanged)}
            className={cn("min-h-tap rounded-xl border px-1 text-small font-semibold", selected.public_live === v ? "border-beach-accent bg-beach-accent text-beach-on-accent" : "border-beach-border bg-beach-bg text-beach-ink")}
          >
            {text}
          </button>
        ))}
      </div>
      {state === "published" ? (
        selected.publish_hold ? (
          <p data-testid="held-note" className="text-small font-semibold">
            {HL.heldNote}
          </p>
        ) : (
          <Btn testId="hold-result" disabled={c.pending} onClick={() => c.setDialog("hold")}>
            {HL.hold}
          </Btn>
        )
      ) : null}
    </section>
  );
}

/** "Release result" beside Publish when the heat's result is held back; "Result held" (greyed, with its reason) while it cannot yet be released. Nothing for a heat that is not held. */
export function ReleaseButton({ c, compact }: { c: HeadController; compact?: boolean }) {
  const { selected, state, review } = c;
  if (!selected || !review || !selected.publish_hold) return null;
  const releasable = state === "published";
  return releasable ? (
    <Btn compact={compact} testId="release" tone="accent" disabled={c.pending} onClick={() => c.act(HL.released, async () => (await setPublishHold(selected.id, false)) as ActionResult, review.onChanged)}>
      {HL.release}
    </Btn>
  ) : (
    <Btn compact={compact} testId="release" reason={HL.heldCannotRelease} disabled onClick={() => undefined}>
      {HL.heldState}
    </Btn>
  );
}

/** Publish, Re-open, Cancel heat and Re-run (also on a cancelled heat), the live-score switch and the held final. `compact` keeps the reasons for assistive technology only. */
export function ReviewButtons({ c, compact = false, visibility = true }: { c: HeadController; compact?: boolean; visibility?: boolean }) {
  const { selected, state, review } = c;
  if (!selected || !state) return null;
  const cancelled = state === "cancelled";
  const again = c.heats.find((h) => h.rerun_of === selected.id);
  const resetRule = resetHeatControl(state, c.alreadyRerun);
  return (
    <div data-testid="review-buttons" className="flex flex-col gap-1.5">
      {visibility ? <VisibilityBox c={c} /> : null}
      {review ? (
        <div className="flex flex-wrap items-start gap-1.5">
          <Btn compact={compact} testId="publish" tone="accent" reason={c.why("publish")} disabled={c.pending || !c.on("publish")} onClick={() => c.setDialog("publish")}>
            {copy.live.console.publish}
          </Btn>
          <ReleaseButton c={c} compact={compact} />
          <Btn compact={compact} testId="reopen" reason={c.why("reopen")} disabled={c.pending || !c.on("reopen")} onClick={() => c.setDialog("reopen")}>
            {copy.live.console.reopen}
          </Btn>
        </div>
      ) : null}
      {selected.reopened_at && selected.status === "under_review" ? (
        <p data-testid="under-correction" className="rounded-lg border border-beach-outlier bg-beach-bg px-2 py-1 text-body font-semibold">
          {HL.underCorrection}
        </p>
      ) : null}
      {c.cancelling ? (
        <div data-testid="cancel-panel" className="flex flex-col gap-1.5 rounded-xl border border-beach-crash bg-beach-bg p-2">
          <label className="flex flex-col gap-1 text-small font-semibold">
            {T.cancelReason}
            <input data-testid="cancel-reason" value={c.reason} onChange={(e) => c.setReason(e.target.value)} placeholder={T.cancelReasonPlaceholder} className="min-h-tap rounded-xl border border-beach-border bg-beach-bg px-2 text-body" />
          </label>
          <div className="flex gap-1.5">
            <Btn testId="cancel-confirm" tone="danger" disabled={c.pending} onClick={c.actions.cancel}>
              {T.cancelConfirm}
            </Btn>
            <Btn testId="cancel-back" onClick={() => c.setCancelling(false)}>
              {T.cancelBack}
            </Btn>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-1.5">
          {review ? (
            <Btn compact={compact} testId="reset-heat" tone="danger" reason={resetRule.reason} disabled={c.pending || !resetRule.enabled} onClick={() => c.setDialog("reset")}>
              {copy.resetParts.heat.open}
            </Btn>
          ) : null}
          {!cancelled ? (
            <Btn compact={compact} testId="cancel" tone="danger" reason={c.why("cancel")} disabled={c.pending || !c.on("cancel")} onClick={() => c.setCancelling(true)}>
              {T.cancel}
            </Btn>
          ) : null}
          {review ? (
            <Btn compact={compact} testId="rerun" tone="danger" reason={c.why("rerun")} disabled={c.pending || !c.on("rerun")} onClick={() => c.setDialog("rerun")}>
              {cancelled && again ? copy.resetParts.alreadyRerunAs(shortHeat(again)) : copy.live.console.rerun}
            </Btn>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** The one-line answer to the last press (what happened, or the plain sentence of why not). */
export function ControlMessage({ c }: { c: HeadController }) {
  const { message, pending } = c;
  return (
    <p data-testid="control-message" data-ok={message?.ok ?? ""} role={message && !message.ok ? "alert" : "status"} aria-live="polite" className={cn("min-h-[1.5rem] text-body font-semibold", message && !message.ok && "rounded-lg border border-beach-failed bg-beach-surface px-2 py-1")}>
      {pending ? T.working : (message?.text ?? "")}
    </p>
  );
}

/** The dialogs that Publish, Re-open, Re-run and Hold result open. One copy of each, wherever the buttons are. */
export function HeatDialogs({ c }: { c: HeadController }) {
  const { review, selected, dialog, title } = c;
  if (!review || !selected) return null;
  const close = () => c.setDialog(null);
  return (
    <>
      {dialog === "publish" ? (
        <PublishDialog
          heatId={selected.id}
          title={title}
          items={review.items}
          canOverride={review.canOverride}
          onChooseOrder={(riders) => {
            close();
            review.onChooseOrder(riders);
          }}
          {...(review.onFix
            ? {
                onFix: (t: FixTarget) => {
                  close();
                  review.onFix!(t);
                },
              }
            : {})}
          onClose={close}
          onDone={(text) => {
            close();
            c.setMessage({ ok: true, text });
            c.patchHeat?.(selected.id, { status: "published" });
            review.onChanged();
          }}
        />
      ) : null}
      {dialog === "reopen" ? (
        <ReopenDialog
          heatId={selected.id}
          title={title}
          onClose={close}
          onDone={(text) => {
            close();
            c.setMessage({ ok: true, text });
            c.patchHeat?.(selected.id, { status: "published" });
            review.onChanged();
          }}
        />
      ) : null}
      {dialog === "rerun" ? (
        <RerunDialog
          heatId={selected.id}
          title={title}
          riders={review.riders}
          onClose={close}
          onDone={(newId) => {
            close();
            c.setMessage({ ok: true, text: HL.rerunDone(title) });
            c.onSelect(newId);
            review.onChanged();
          }}
        />
      ) : null}
      {dialog === "reset" ? (
        <ResetHeatDialog
          heatId={selected.id}
          title={title}
          onClose={close}
          onDone={(text) => {
            close();
            c.setMessage({ ok: true, text });
            c.patchHeat?.(selected.id, { status: "published" });
            review.onChanged();
          }}
        />
      ) : null}
      {dialog === "hold" ? (
        <HoldDialog
          heatId={selected.id}
          title={title}
          onClose={close}
          onDone={() => {
            close();
            c.setMessage({ ok: true, text: HL.held });
            review.onChanged();
          }}
        />
      ) : null}
    </>
  );
}
