"use client";

import { ClearActualsButton } from "../reset-buttons";
import { ClearPlanButton } from "./clear-plan-button";
import { handPinsAfter, planActuals } from "@/lib/schedule/hand-pins";
import { NumberField } from "@/components/org/number-field";
import { DndContext, pointerWithin, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import {
  addBreak,
  addHeatsToPlan,
  addHeatToPlan,
  addNote,
  computeTimetable,
  moveItem,
  nudgeItem,
  removeItem,
  renameItem,
  RunOrderError,
  setBreakAfter,
  setDuration,
  setPin,
  setWarmUp,
  timetableExportRows,
  unscheduledHeats,
  type HeatInfo,
  type HeatLive,
} from "@/lib/engine/schedule";
import { clockIn, heatsRanOn, rowToPlan, shortDay, type PlanRow } from "@/lib/schedule/plans";
import { driftOf, plannedTimetable } from "@/lib/schedule/drift";
import { ClockText } from "@/components/clock-text";
import { DriftBadge } from "@/components/drift-badge";
import { Banner } from "@/components/ui/banner";
import { Check } from "lucide-react";
import { Pill } from "@/components/live/pill";
import { drawTimetablePng } from "@/lib/schedule/export-png";
import type { SchedulePlan } from "@/lib/schemas/schedule";
import { toast } from "@/hooks/use-toast";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
import { activatePlan, copyPlanToDayAction, createPlan, deletePlanAction, duplicatePlanAction, savePlan } from "./actions";
import { copySources, dayStatus, defaultPlanName } from "@/lib/schedule/day-plans";
import { holdPlan as holdPlanAction, resumePlanAt as resumePlanAtAction, shiftPlan as shiftPlanAction, type PlanActionResult } from "@/lib/live/heat-actions";

const T = copy.runOrder;

export interface ScheduleProps {
  /** The day to open on (?day=, from the dashboard's Fix). */
  initialDay?: string;
  eventId: string;
  eventName: string;
  timezone: string;
  days: string[];
  today: string;
  /** The server's time when the page was made: the clock keeps its own offset from it. */
  serverNow: string;
  logoUrl: string | null;
  readyCallMin: number;
  infos: HeatInfo[];
  lives: HeatLive[];
  plans: PlanRow[];
}

function UnscheduledHeat({ h, onAdd, disabled }: { h: HeatInfo; onAdd: () => void; disabled: boolean }) {
  const drag = useDraggable({ id: `u:${h.heatId}`, disabled });
  return (
    <li ref={drag.setNodeRef} className={cn("flex items-center gap-2 rounded-lg border border-beach-line bg-beach-bg px-2 py-1", drag.isDragging ? "opacity-40" : "")} data-testid="unscheduled-heat">
      <button type="button" className="btn !min-h-[var(--org-ctl)] !px-2" aria-label={T.dragHeat(h.division, h.heat)} {...drag.listeners} {...drag.attributes} disabled={disabled}>
        ⠿
      </button>
      <span className="min-w-0 flex-1 font-semibold">{h.heat}</span>
      <span className="text-sm font-semibold">{T.lengthShort(h.warmUpMin, h.durationMin)}</span>
      <button type="button" className="btn !min-h-[var(--org-ctl)]" disabled={disabled} aria-label={T.addHeatLabel(h.division, h.round, h.heat)} onClick={onAdd}>
        {T.add}
      </button>
    </li>
  );
}

function RowShell({ id, problem, children }: { id: string; problem?: string; children: React.ReactNode }) {
  const drop = useDroppable({ id: `row:${id}` });
  const drag = useDraggable({ id: `row:${id}` });
  return (
    <li
      ref={(el) => {
        drop.setNodeRef(el);
        drag.setNodeRef(el);
      }}
      className={cn("flex flex-col gap-1 rounded-lg border border-beach-line bg-beach-bg p-2", drop.isOver ? "bg-beach-surface" : "", drag.isDragging ? "opacity-40" : "")}
      data-testid="run-row"
    >
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn !min-h-[var(--org-ctl)] !px-2" aria-label={T.dragRow} {...drag.listeners} {...drag.attributes}>
          ⠿
        </button>
        {children}
      </div>
      {problem ? (
        <p role="note" className="rounded border border-beach-line bg-beach-tint-grade0 px-2 py-1 text-sm font-semibold" data-testid="row-problem">
          {T.rowProblem(problem)}
        </p>
      ) : null}
    </li>
  );
}

export function ScheduleManager(props: ScheduleProps) {
  const { eventId, timezone, days, today, lives, infos, readyCallMin } = props;
  const [plans, setPlans] = useState<PlanRow[]>(props.plans);
  // the day to open on: the address's ?day= (the dashboard's Fix sends today), else today, else the first day of the event
  const [day, setDay] = useState(props.initialDay && days.includes(props.initialDay) ? props.initialDay : days.includes(today) ? today : days[0]);
  const [dayName, setDayName] = useState<string | null>(null);
  // after a copy: how many heats came, and what is still to add (cleared when another day or plan is picked)
  const [copiedNote, setCopiedNote] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [dupName, setDupName] = useState("");
  const [newName, setNewName] = useState("");
  const [pinning, setPinning] = useState<string | null>(null);
  const [pinTime, setPinTime] = useState("");
  const [breakLabel, setBreakLabel] = useState("");
  const [breakMin, setBreakMin] = useState(30);
  const [noteText, setNoteText] = useState("");
  const [allBreaks, setAllBreaks] = useState(3);
  const [resumeAt, setResumeAt] = useState("");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const dayPlans = plans.filter((p) => p.day === day);
  const currentRow = dayPlans.find((p) => p.id === planId) ?? dayPlans.find((p) => p.active) ?? dayPlans[0] ?? null;
  const parsed = useMemo(() => {
    if (!currentRow) return null;
    try {
      return rowToPlan(currentRow, readyCallMin);
    } catch (e) {
      return { error: (e as Error).message } as const;
    }
  }, [currentRow, readyCallMin]);
  const ok = parsed && !("error" in parsed) ? parsed : null;
  const plan = ok?.plan ?? null;
  const isToday = day === today;
  const now = isToday ? Date.now() : undefined;

  const table = useMemo(() => {
    if (!ok) return null;
    return computeTimetable(ok.plan, lives, { timezone, eventDay: day, defaults: ok.defaults, ...(now !== undefined ? { now: new Date(now).toISOString() } : {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` is read when the plan changes, not every render
  }, [ok, lives, timezone, day]);
  // today's plan only: how far the next heat that has not started is from where the plan as written put it
  const drift = useMemo(() => (ok && table && isToday ? driftOf(plannedTimetable(ok.plan, lives, { timezone, eventDay: day, defaults: ok.defaults }), table) : null), [ok, table, isToday, lives, timezone, day]);
  const startedIds = useMemo(() => new Set(lives.filter((l) => l.startedAt).map((l) => l.heatId)), [lives]);
  const infoById = useMemo(() => new Map(infos.map((i) => [i.heatId, i])), [infos]);
  const groups = plan ? unscheduledHeats(infos, plan) : [];

  /** Applies an engine edit to the plan, shows it at once and saves it; if the save fails the old plan comes back with the reason. */
  function mutate(f: (p: SchedulePlan) => SchedulePlan, extraDefaults?: unknown) {
    if (!currentRow || !plan) return;
    setError(null);
    let next: SchedulePlan;
    try {
      next = f(plan);
    } catch (e) {
      setError(e instanceof RunOrderError ? e.message : T.errors.failed);
      return;
    }
    const before = currentRow;
    const after: PlanRow = { ...currentRow, name: next.name, items: next.items, anchors: next.anchors, hand_pins: handPinsAfter(currentRow, next.anchors), actual_starts: next.actualStarts, hold: next.hold ?? null, ...(extraDefaults !== undefined ? { defaults: extraDefaults } : {}) };
    setPlans((ps) => ps.map((p) => (p.id === after.id ? after : p)));
    startTransition(async () => {
      const r = await savePlan(after.id, { name: next.name, items: next.items, anchors: next.anchors, actualStarts: next.actualStarts, hold: next.hold, ...(extraDefaults !== undefined ? { defaults: extraDefaults } : {}) });
      if (!r.ok) {
        setPlans((ps) => ps.map((p) => (p.id === before.id ? before : p)));
        setError(r.error);
      }
    });
  }

  function act<R extends { ok: boolean }>(run: () => Promise<R>, then: (r: R & { ok: true }) => void) {
    setError(null);
    startTransition(async () => {
      const r = await run();
      if (r.ok) then(r as R & { ok: true });
      else setError((r as unknown as { error: string }).error);
    });
  }

  /** Hold, Resume at and Shift run on the server with the database's own clock (never this device's); the answer is the plan's hold and pins as they are now. */
  function live(run: () => Promise<PlanActionResult>) {
    const id = currentRow?.id;
    act(
      async () => {
        const r = await run();
        return r.ok ? r : { ok: false as const, error: r.message };
      },
      (r) => setPlans((ps) => ps.map((p) => (p.id === id ? { ...p, hold: r.hold, anchors: r.anchors } : p))),
    );
  }

  function onDragEnd(e: DragEndEvent) {
    if (!plan || !e.over) return;
    const activeId = String(e.active.id);
    const overItem = String(e.over.id).startsWith("row:") ? String(e.over.id).slice(4) : null;
    const at = overItem ? plan.items.findIndex((i) => i.id === overItem) : plan.items.length;
    if (activeId.startsWith("u:")) mutate((p) => addHeatToPlan(p, activeId.slice(2), at < 0 ? undefined : at));
    else if (activeId.startsWith("row:") && overItem && activeId.slice(4) !== overItem) mutate((p) => moveItem(p, activeId.slice(4), at, lives));
  }

  async function exportPng() {
    if (!table) return;
    const { rows, showWarmUp } = timetableExportRows(table);
    const blob = await drawTimetablePng({ title: props.eventName, subtitle: `${T.dayLabel(day)} · ${plan?.name ?? ""}`, rows, showWarmUp, logoUrl: props.logoUrl, finish: table.finish });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timetable-${day}.png`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: T.pngDone });
  }

  const ranOn = plan ? heatsRanOn(plan.items.flatMap((i) => (i.kind === "heat" && i.heatId ? [i.heatId] : [])), lives, timezone) : [];
  const liveStarted = (itemId: string) => {
    const item = plan?.items.find((i) => i.id === itemId);
    return item?.kind === "heat" && startedIds.has(item.heatId!);
  };

  return (
    <div className="flex flex-col gap-4">
      <section aria-label={T.plansLabel} className="flex flex-col gap-3 rounded-card border border-beach-line p-3" data-testid="plan-tools">
      <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="day-pick" className="text-small font-semibold">
              {T.dayPick}
            </label>
            <select id="day-pick" value={day} onChange={(e) => { setDay(e.target.value); setPlanId(null); }}>
              {days.map((d) => (
                <option key={d} value={d}>
                  {T.dayOption(T.dayLabel(d), dayStatus(plans, d))}
                </option>
              ))}
            </select>
          </div>
          {dayPlans.length > 0 ? (
            <div className="flex flex-col gap-1">
              <label htmlFor="plan-pick" className="text-small font-semibold">
                {T.planPick}
              </label>
              <select id="plan-pick" value={currentRow?.id ?? ""} onChange={(e) => setPlanId(e.target.value)}>
                {dayPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.active ? ` (${T.activeTag})` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {currentRow && !currentRow.active ? (
            <ConfirmButton
              label={T.activate}
              question={T.activateQuestion(currentRow.name)}
              confirmLabel={T.activateYes}
              cancelLabel={copy.common.cancel}
              pending={pending}
              onConfirm={() =>
                act(() => activatePlan(currentRow.id), () => {
                  setPlans((ps) => ps.map((p) => (p.day === day ? { ...p, active: p.id === currentRow.id } : p)));
                  toast({ title: T.activated(currentRow.name) });
                })
              }
            />
          ) : currentRow ? (
            <Pill icon={Check} tone="live">{T.activeTag}</Pill>
          ) : null}
          {currentRow && !currentRow.active ? (
            <ConfirmButton label={T.deletePlan} question={T.deleteQuestion(currentRow.name)} confirmLabel={T.deleteYes} cancelLabel={copy.common.cancel} danger pending={pending} onConfirm={() => act(() => deletePlanAction(currentRow.id), () => { setPlans((ps) => ps.filter((p) => p.id !== currentRow.id)); setPlanId(null); })} />
          ) : null}
        </div>

        {copiedNote && dayPlans.length > 0 ? (
          <p role="status" data-testid="copied-note" className="rounded-[8px] border border-beach-line bg-beach-surface p-3 text-body font-semibold">
            {copiedNote}
          </p>
        ) : null}

        {dayPlans.length === 0 ? (
          <div data-testid="no-plan-day" className="flex flex-col gap-3 rounded-[8px] border border-beach-line bg-beach-surface p-3">
            <p className="text-body font-semibold">{T.noPlanDay(shortDay(day))}</p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="day-plan-name" className="text-small font-semibold">
                  {T.createName}
                </label>
                <input id="day-plan-name" value={dayName ?? defaultPlanName(plans, day)} onChange={(e) => setDayName(e.target.value)} className="w-72" />
              </div>
              <button
                type="button"
                className="btn btn-primary"
                data-testid="create-day-plan"
                disabled={pending || (dayName ?? defaultPlanName(plans, day)).trim().length < 2}
                onClick={() => act(() => createPlan(eventId, day, dayName ?? defaultPlanName(plans, day)), (r) => { setPlans((ps) => [...ps, r.row]); setPlanId(r.row.id); setDayName(null); toast({ title: T.copied(r.row.name) }); })}
              >
                {T.createForDay(shortDay(day))}
              </button>
              {(dayName ?? defaultPlanName(plans, day)).trim().length < 2 ? <span className="text-small font-medium text-beach-muted">{T.needName}</span> : null}
            </div>
            {copySources(plans, day).length ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  {copySources(plans, day).map((src) => (
                    <button
                      key={src.id}
                      type="button"
                      className="btn"
                      data-testid="copy-day-plan"
                      data-from={src.day}
                      disabled={pending || (dayName ?? defaultPlanName(plans, day)).trim().length < 2}
                      onClick={() => act(() => copyPlanToDayAction(src.id, day, dayName ?? defaultPlanName(plans, day)), (r) => { setPlans((ps) => [...ps, r.row]); setPlanId(r.row.id); setDayName(null); setCopiedNote(T.copiedHeats(r.heats)); toast({ title: T.copied(r.row.name) }); })}
                    >
                      {T.copyToDay(shortDay(src.day), shortDay(day))}
                    </button>
                  ))}
                </div>
                <p className="text-small font-medium text-beach-muted">{T.copyNote}</p>
              </div>
            ) : null}
          </div>
        ) : null}
        {currentRow ? (
          <div className="flex flex-wrap items-start gap-3" data-testid="plan-actuals">
            <ClearActualsButton planId={currentRow.id} planName={currentRow.name} {...planActuals(currentRow)} />
            {plan ? (
              <ClearPlanButton
                planId={currentRow.id}
                planName={currentRow.name}
                plan={plan}
                started={startedIds}
                onCleared={(r) => setPlans((ps) => ps.map((p) => (p.id === currentRow.id ? { ...p, items: r.items, anchors: r.anchors, actual_starts: r.actualStarts, hand_pins: handPinsAfter(currentRow, r.anchors as Record<string, string>) } : p)))}
              />
            ) : null}
          </div>
        ) : null}
        {currentRow ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="dup-name" className="text-small font-semibold">
                {T.duplicateName}
              </label>
              <input id="dup-name" value={dupName} onChange={(e) => setDupName(e.target.value)} placeholder={T.duplicatePlaceholder} className="w-72" />
            </div>
            <button type="button" className="btn" disabled={pending || dupName.trim().length < 2} onClick={() => act(() => duplicatePlanAction(currentRow.id, dupName), (r) => { setPlans((ps) => [...ps, r.row]); setPlanId(r.row.id); setDupName(""); toast({ title: T.duplicated(r.row.name) }); })}>
              {T.duplicate}
            </button>
            {dupName.trim().length < 2 ? <span className="text-small font-medium text-beach-muted" data-testid="why-duplicate">{T.needName}</span> : null}
          </div>
        ) : null}
        {dayPlans.length > 0 ? <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="new-plan" className="text-small font-semibold">
              {T.newPlanName}
            </label>
            <input id="new-plan" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={T.newPlanPlaceholder} className="w-72" />
          </div>
          <button type="button" className="btn" disabled={pending || newName.trim().length < 2} onClick={() => act(() => createPlan(eventId, day, newName), (r) => { setPlans((ps) => [...ps, r.row]); setPlanId(r.row.id); setNewName(""); })}>
            {T.newPlan}
          </button>
          {newName.trim().length < 2 ? <span className="text-small font-medium text-beach-muted" data-testid="why-new-plan">{T.needName}</span> : null}
        </div> : null}
      </section>

      {error ? (
        <p role="alert" className="panel field-error" data-testid="run-error">
          {copy.common.problem(error)}
        </p>
      ) : null}
      {parsed && "error" in parsed ? <p role="alert" className="panel field-error">{parsed.error}</p> : null}
      {!currentRow ? <p className="panel text-lg font-semibold">{T.noPlan}</p> : null}

      {plan && table ? (
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={onDragEnd}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-card border border-beach-line bg-beach-surface px-4 py-3" data-testid="run-header">
            <span className="text-[16px] font-semibold">{plan.name}</span>
            <ClockText timezone={timezone} serverNow={props.serverNow} />
            <DriftBadge drift={drift} />
            <span className="text-body font-semibold" data-testid="run-finish">
              {table.finish ? T.finish(table.finish) : T.noFinish}
            </span>
            <span className="text-body font-semibold" data-testid="run-left">
              {T.heatsLeft(table.heatsLeft)}
            </span>
            {table.rows.find((r) => r.warmUpStart) ? <span className="font-semibold">{T.firstWarmUp(table.rows.find((r) => r.warmUpStart)!.warmUpStart!)}</span> : null}
            {plan.hold ? <span className="font-semibold" data-testid="run-hold">{T.onHold(clockIn(timezone, Date.parse(plan.hold.since)))}</span> : null}
          </div>
          {ranOn.length > 0 ? (
            <Banner data-testid="heats-ran-on">{T.heatsRanOn(ranOn.map(shortDay))}</Banner>
          ) : null}
          {table.warnings.length > 0 ? (
            <ul className="panel list-disc pl-8 font-semibold" aria-label={T.warningsLabel} data-testid="run-warnings">
              {table.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
            <section className="flex flex-col gap-3" aria-label={T.leftHeading}>
              <h2 className="text-xl font-semibold">{T.leftHeading}</h2>
              {groups.length === 0 ? <p className="font-semibold">{T.allScheduled}</p> : null}
              {groups.map((g) => (
                <div key={`${g.division}|${g.round}`} className="flex flex-col gap-1" data-testid="unscheduled-group">
                  <div className="flex items-center gap-2">
                    <h3 className="min-w-0 flex-1 font-semibold">
                      {g.division} · {g.round}
                    </h3>
                    <button type="button" className="btn !min-h-[var(--org-ctl)]" disabled={pending} onClick={() => mutate((p) => addHeatsToPlan(p, g.heats.map((h) => h.heatId)))}>
                      {T.addAll(g.heats.length)}
                    </button>
                  </div>
                  <ul className="flex flex-col gap-1">
                    {g.heats.map((h) => (
                      <UnscheduledHeat key={h.heatId} h={h} disabled={pending} onAdd={() => mutate((p) => addHeatToPlan(p, h.heatId))} />
                    ))}
                  </ul>
                </div>
              ))}
            </section>

            <section className="flex min-w-0 flex-col gap-3" aria-label={T.rightHeading}>
              <h2 className="text-xl font-semibold">{T.rightHeading}</h2>
              <div className="panel flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="break-label" className="text-sm font-semibold">{T.breakLabel}</label>
                  <input id="break-label" value={breakLabel} onChange={(e) => setBreakLabel(e.target.value)} placeholder={T.breakPlaceholder} className="w-44" />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="break-min" className="text-sm font-semibold">{T.breakMinutes}</label>
                  <NumberField id="break-min" label={T.breakMinutes} min={1} max={999} value={breakMin} onChange={setBreakMin} />
                </div>
                <button type="button" className="btn" disabled={pending} onClick={() => mutate((p) => addBreak(p, { label: breakLabel, durationMin: breakMin }))}>{T.addBreak}</button>
                <div className="flex flex-col gap-1">
                  <label htmlFor="note-text" className="text-sm font-semibold">{T.noteLabel}</label>
                  <input id="note-text" value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder={T.notePlaceholder} className="w-44" />
                </div>
                <button type="button" className="btn" disabled={pending} onClick={() => mutate((p) => addNote(p, noteText))}>{T.addNote}</button>
                <div className="flex flex-col gap-1">
                  <label htmlFor="all-breaks" className="text-sm font-semibold">{T.allBreaks}</label>
                  <NumberField id="all-breaks" label={T.allBreaks} min={0} max={999} value={allBreaks} onChange={setAllBreaks} />
                </div>
                <button type="button" className="btn" disabled={pending} onClick={() => mutate((p) => p.items.reduce((acc, i) => (i.kind === "heat" && !liveStarted(i.id) ? setBreakAfter(acc, i.id, allBreaks, lives) : acc), p))}>{T.applyAllBreaks}</button>
              </div>

              {table.rows.length === 0 ? <p className="panel font-semibold">{T.emptyRun}</p> : null}
              <ol className="flex flex-col gap-2" data-testid="run-order">
                {table.rows.map((r, idx) => {
                  const started = liveStarted(r.itemId);
                  return (
                    <RowShell key={r.itemId} id={r.itemId} problem={r.issue ? r.warnings[0] : undefined}>
                      <span className="w-7 text-center font-semibold" aria-hidden>{idx + 1}</span>
                      {r.kind === "heat" ? (
                        <span className="min-w-0 flex-1 basis-56 font-semibold" data-testid="row-label">
                          {[r.division, r.round, r.heat].filter(Boolean).join(" · ") || T.goneHeat}
                        </span>
                      ) : (
                        <input
                          aria-label={T.rowLabel(idx + 1)}
                          className="min-w-0 flex-1 basis-56 !font-semibold"
                          defaultValue={r.label}
                          key={r.label}
                          onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== r.label && mutate((p) => renameItem(p, r.itemId, e.target.value))}
                        />
                      )}
                      {r.kind === "heat" && r.warmUpMin > 0 ? <span className="text-sm font-semibold" data-testid="row-warmup">{T.warmUpAt(r.warmUpStart ?? "–")}</span> : null}
                      {r.kind !== "note" ? (
                        pinning === r.itemId ? (
                          <span className="flex items-center gap-1">
                            <input type="time" aria-label={T.pinTimeLabel(idx + 1)} value={pinTime} onChange={(e) => setPinTime(e.target.value)} className="w-32" />
                            <button type="button" className="btn btn-primary !min-h-[var(--org-ctl)]" disabled={!pinTime} title={!pinTime ? T.needTime : undefined} onClick={() => { mutate((p) => setPin(p, r.itemId, pinTime, lives)); setPinning(null); }}>{T.pin}</button>
                            {r.pinned ? <button type="button" className="btn !min-h-[var(--org-ctl)]" onClick={() => { mutate((p) => setPin(p, r.itemId, null, lives)); setPinning(null); }}>{T.unpin}</button> : null}
                            <button type="button" className="btn !min-h-[var(--org-ctl)]" onClick={() => setPinning(null)}>{copy.common.cancel}</button>
                          </span>
                        ) : (
                          <button type="button" className="btn !min-h-[var(--org-ctl)]" disabled={started} title={started ? T.startedRow : undefined} aria-label={T.startButton(idx + 1, r.start ?? "–")} data-testid="row-start" onClick={() => { setPinning(r.itemId); setPinTime(r.start ?? ""); }}>
                            {r.pinned ? "📌 " : ""}
                            {r.start ?? "–"}
                          </button>
                        )
                      ) : (
                        <span className="font-semibold">{r.start ?? "–"}</span>
                      )}
                      {r.kind !== "note" ? (
                        <label className="flex items-center gap-1 text-sm font-semibold">
                          {T.durationShort}
                          <NumberField label={T.durationLabel(idx + 1)} min={1} max={999} step={0.5} commit="blur" disabled={started} value={r.durationMin} onChange={(n) => mutate((p) => setDuration(p, r.itemId, n, lives))} />
                        </label>
                      ) : null}
                      {r.kind !== "note" ? <span className="text-sm font-semibold" data-testid="row-end">{T.endAt(r.end ?? "–")}</span> : null}
                      {r.kind === "heat" ? (
                        <label className="flex items-center gap-1 text-sm font-semibold">
                          {T.breakShort}
                          <NumberField label={T.breakAfterLabel(idx + 1)} min={0} max={999} step={0.5} commit="blur" value={r.breakAfterMin ?? null} placeholder={String(r.breakAfterMin ?? "")} onChange={(n) => mutate((p) => setBreakAfter(p, r.itemId, n, lives))} />
                        </label>
                      ) : null}
                      <span className="text-sm font-semibold" data-testid="row-status">{T.status[r.status]}</span>
                      {started ? <span className="text-small font-medium text-beach-muted" data-testid="row-why">{T.startedRow}</span> : null}
                      <button type="button" className="btn !min-h-[var(--org-ctl)] !px-3" disabled={pending || started || idx === 0} title={started ? T.startedRow : idx === 0 ? T.alreadyFirst : undefined} aria-label={T.moveUp(idx + 1)} onClick={() => mutate((p) => nudgeItem(p, r.itemId, -1, lives))}>↑</button>
                      <button type="button" className="btn !min-h-[var(--org-ctl)] !px-3" disabled={pending || started || idx === table.rows.length - 1} title={started ? T.startedRow : idx === table.rows.length - 1 ? T.alreadyLast : undefined} aria-label={T.moveDown(idx + 1)} onClick={() => mutate((p) => nudgeItem(p, r.itemId, 1, lives))}>↓</button>
                      {r.kind === "heat" && !started ? <button type="button" className="btn !min-h-[var(--org-ctl)] !px-3" aria-expanded={openRow === r.itemId} onClick={() => setOpenRow(openRow === r.itemId ? null : r.itemId)}>⋯</button> : null}
                      <button type="button" className="btn !min-h-[var(--org-ctl)] !px-3" disabled={pending || started} title={started ? T.startedRow : undefined} aria-label={T.removeRow(idx + 1)} onClick={() => mutate((p) => removeItem(p, r.itemId, lives))}>✕</button>
                    </RowShell>
                  );
                })}
              </ol>
              {table.rows.map((r) => {
                if (openRow !== r.itemId || r.kind !== "heat") return null;
                const it = plan.items.find((i) => i.id === r.itemId);
                return (
                  <div key={`x-${r.itemId}`} className="panel flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1 font-semibold">
                      {T.warmUpRow}
                      <NumberField label={T.warmUpRow} min={0} max={999} step={0.5} commit="blur" value={r.warmUpMin} onChange={(n) => mutate((p) => setWarmUp(p, r.itemId, n, lives))} />
                    </label>
                    {it && it.kind === "heat" ? <span className="text-sm font-semibold">{infoById.get(it.heatId!)?.heat}</span> : null}
                  </div>
                );
              })}

              <div className="panel flex flex-col gap-3" data-testid="live-overrides">
                <h3 className="text-lg font-semibold">{T.liveHeading}</h3>
                <p className="text-sm font-semibold">{T.liveNote}</p>
                <div className="flex flex-wrap items-end gap-3">
                  {plan.hold ? (
                    <>
                      <div className="flex flex-col gap-1">
                        <label htmlFor="resume-at" className="text-sm font-semibold">{T.resumeAt}</label>
                        <input id="resume-at" type="time" value={resumeAt} onChange={(e) => setResumeAt(e.target.value)} className="w-32" />
                      </div>
                      <button type="button" className="btn btn-primary" disabled={pending || !resumeAt} title={!resumeAt ? T.needTime : undefined} onClick={() => currentRow && live(() => resumePlanAtAction(currentRow.id, resumeAt))}>{T.resume}</button>
                    </>
                  ) : (
                    <button type="button" className="btn" disabled={pending || !currentRow?.active} title={!currentRow?.active ? T.needActive : undefined} onClick={() => currentRow && live(() => holdPlanAction(currentRow.id))}>{T.hold}</button>
                  )}
                  {[5, 10].map((m) => (
                    <button key={m} type="button" className="btn" disabled={pending || !currentRow?.active || Boolean(plan.hold)} title={!currentRow?.active ? T.needActive : plan.hold ? T.heldNoShift : undefined} onClick={() => currentRow && live(() => shiftPlanAction(currentRow.id, m))}>
                      {T.shift(m)}
                    </button>
                  ))}
                </div>
                {!currentRow?.active ? <p className="text-small font-medium text-beach-muted" data-testid="why-live">{T.needActive}</p> : plan.hold ? <p className="text-small font-medium text-beach-muted" data-testid="why-live">{plan.hold && !resumeAt ? `${T.heldNoShift} ${T.needTime}` : T.heldNoShift}</p> : null}
                <p className="text-sm font-semibold">{T.lengthHint}</p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link className="btn" href={`/org/events/${eventId}/schedule/print?plan=${plan.id}`} target="_blank">{T.exportPdf}</Link>
                <button type="button" className="btn" onClick={exportPng}>{T.exportPng}</button>
              </div>
            </section>
          </div>
        </DndContext>
      ) : null}
    </div>
  );
}
