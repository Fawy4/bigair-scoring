"use client";

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
import { clockIn, rowToPlan, type PlanRow } from "@/lib/schedule/plans";
import { drawTimetablePng } from "@/lib/schedule/export-png";
import type { SchedulePlan } from "@/lib/schemas/schedule";
import { toast } from "@/hooks/use-toast";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
import { activatePlan, createPlan, deletePlanAction, duplicatePlanAction, savePlan } from "./actions";
import { holdPlan as holdPlanAction, resumePlanAt as resumePlanAtAction, shiftPlan as shiftPlanAction, type PlanActionResult } from "@/lib/live/heat-actions";

const T = copy.runOrder;

export interface ScheduleProps {
  eventId: string;
  eventName: string;
  timezone: string;
  days: string[];
  today: string;
  logoUrl: string | null;
  readyCallMin: number;
  infos: HeatInfo[];
  lives: HeatLive[];
  plans: PlanRow[];
}

function UnscheduledHeat({ h, onAdd, disabled }: { h: HeatInfo; onAdd: () => void; disabled: boolean }) {
  const drag = useDraggable({ id: `u:${h.heatId}`, disabled });
  return (
    <li ref={drag.setNodeRef} className={cn("flex items-center gap-2 rounded-lg border-2 border-[#111] bg-white px-2 py-1", drag.isDragging ? "opacity-40" : "")} data-testid="unscheduled-heat">
      <button type="button" className="btn !min-h-[40px] !px-2" aria-label={T.dragHeat(h.division, h.heat)} {...drag.listeners} {...drag.attributes} disabled={disabled}>
        ⠿
      </button>
      <span className="min-w-0 flex-1 font-bold">{h.heat}</span>
      <span className="text-sm font-semibold">{T.lengthShort(h.warmUpMin, h.durationMin)}</span>
      <button type="button" className="btn !min-h-[40px]" disabled={disabled} aria-label={T.addHeatLabel(h.division, h.round, h.heat)} onClick={onAdd}>
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
      className={cn("flex flex-col gap-1 rounded-lg border-2 border-[#111] bg-white p-2", drop.isOver ? "bg-[#e5e7eb]" : "", drag.isDragging ? "opacity-40" : "")}
      data-testid="run-row"
    >
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn !min-h-[40px] !px-2" aria-label={T.dragRow} {...drag.listeners} {...drag.attributes}>
          ⠿
        </button>
        {children}
      </div>
      {problem ? (
        <p role="note" className="rounded border-2 border-[#111] bg-[#fde68a] px-2 py-1 text-sm font-bold" data-testid="row-problem">
          {T.rowProblem(problem)}
        </p>
      ) : null}
    </li>
  );
}

export function ScheduleManager(props: ScheduleProps) {
  const { eventId, timezone, days, today, lives, infos } = props;
  const [plans, setPlans] = useState<PlanRow[]>(props.plans);
  const [day, setDay] = useState(days.includes(today) ? today : days[0]);
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
      return rowToPlan(currentRow);
    } catch (e) {
      return { error: (e as Error).message } as const;
    }
  }, [currentRow]);
  const ok = parsed && !("error" in parsed) ? parsed : null;
  const plan = ok?.plan ?? null;
  const isToday = day === today;
  const now = isToday ? Date.now() : undefined;

  const table = useMemo(() => {
    if (!ok) return null;
    return computeTimetable(ok.plan, lives, { timezone, eventDay: day, defaults: ok.defaults, ...(now !== undefined ? { now: new Date(now).toISOString() } : {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` is read when the plan changes, not every render
  }, [ok, lives, timezone, day]);
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
    const after: PlanRow = { ...currentRow, name: next.name, items: next.items, anchors: next.anchors, actual_starts: next.actualStarts, hold: next.hold ?? null, ...(extraDefaults !== undefined ? { defaults: extraDefaults } : {}) };
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

  const liveStarted = (itemId: string) => {
    const item = plan?.items.find((i) => i.id === itemId);
    return item?.kind === "heat" && startedIds.has(item.heatId!);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="panel flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="day-pick" className="font-bold">
            {T.dayPick}
          </label>
          <select id="day-pick" value={day} onChange={(e) => { setDay(e.target.value); setPlanId(null); }}>
            {days.map((d) => (
              <option key={d} value={d}>
                {T.dayLabel(d)}
              </option>
            ))}
          </select>
        </div>
        {dayPlans.length > 0 ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="plan-pick" className="font-bold">
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
          <span className="font-extrabold">{T.activeTag}</span>
        ) : null}
        {currentRow && !currentRow.active ? (
          <ConfirmButton label={T.deletePlan} question={T.deleteQuestion(currentRow.name)} confirmLabel={T.deleteYes} cancelLabel={copy.common.cancel} danger pending={pending} onConfirm={() => act(() => deletePlanAction(currentRow.id), () => { setPlans((ps) => ps.filter((p) => p.id !== currentRow.id)); setPlanId(null); })} />
        ) : null}
      </div>

      {currentRow ? (
        <div className="panel flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="dup-name" className="font-bold">
              {T.duplicateName}
            </label>
            <input id="dup-name" value={dupName} onChange={(e) => setDupName(e.target.value)} placeholder={T.duplicatePlaceholder} className="w-72" />
          </div>
          <button type="button" className="btn" disabled={pending || dupName.trim().length < 2} onClick={() => act(() => duplicatePlanAction(currentRow.id, dupName), (r) => { setPlans((ps) => [...ps, r.row]); setPlanId(r.row.id); setDupName(""); toast({ title: T.duplicated(r.row.name) }); })}>
            {T.duplicate}
          </button>
        </div>
      ) : null}
      <div className="panel flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="new-plan" className="font-bold">
            {T.newPlanName}
          </label>
          <input id="new-plan" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={T.newPlanPlaceholder} className="w-72" />
        </div>
        <button type="button" className="btn" disabled={pending || newName.trim().length < 2} onClick={() => act(() => createPlan(eventId, day, newName), (r) => { setPlans((ps) => [...ps, r.row]); setPlanId(r.row.id); setNewName(""); })}>
          {T.newPlan}
        </button>
      </div>

      {error ? (
        <p role="alert" className="panel field-error" data-testid="run-error">
          {copy.common.problem(error)}
        </p>
      ) : null}
      {parsed && "error" in parsed ? <p role="alert" className="panel field-error">{parsed.error}</p> : null}
      {!currentRow ? <p className="panel text-lg font-semibold">{T.noPlan}</p> : null}

      {plan && table ? (
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={onDragEnd}>
          <div className="panel flex flex-wrap items-center gap-x-6 gap-y-2" data-testid="run-header">
            <span className="text-xl font-extrabold">{plan.name}</span>
            <span className="text-lg font-bold" data-testid="run-finish">
              {table.finish ? T.finish(table.finish) : T.noFinish}
            </span>
            <span className="text-lg font-bold" data-testid="run-left">
              {T.heatsLeft(table.heatsLeft)}
            </span>
            {table.rows.find((r) => r.warmUpStart) ? <span className="font-semibold">{T.firstWarmUp(table.rows.find((r) => r.warmUpStart)!.warmUpStart!)}</span> : null}
            {plan.hold ? <span className="font-extrabold" data-testid="run-hold">{T.onHold(clockIn(timezone, Date.parse(plan.hold.since)))}</span> : null}
          </div>
          {table.warnings.length > 0 ? (
            <ul className="panel list-disc pl-8 font-semibold" aria-label={T.warningsLabel} data-testid="run-warnings">
              {table.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
            <section className="flex flex-col gap-3" aria-label={T.leftHeading}>
              <h2 className="text-xl font-extrabold">{T.leftHeading}</h2>
              {groups.length === 0 ? <p className="font-semibold">{T.allScheduled}</p> : null}
              {groups.map((g) => (
                <div key={`${g.division}|${g.round}`} className="flex flex-col gap-1" data-testid="unscheduled-group">
                  <div className="flex items-center gap-2">
                    <h3 className="min-w-0 flex-1 font-extrabold">
                      {g.division} · {g.round}
                    </h3>
                    <button type="button" className="btn !min-h-[40px]" disabled={pending} onClick={() => mutate((p) => addHeatsToPlan(p, g.heats.map((h) => h.heatId)))}>
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
              <h2 className="text-xl font-extrabold">{T.rightHeading}</h2>
              <div className="panel flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="break-label" className="text-sm font-bold">{T.breakLabel}</label>
                  <input id="break-label" value={breakLabel} onChange={(e) => setBreakLabel(e.target.value)} placeholder={T.breakPlaceholder} className="w-44" />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="break-min" className="text-sm font-bold">{T.breakMinutes}</label>
                  <input id="break-min" type="number" min={1} value={breakMin} onChange={(e) => setBreakMin(Number(e.target.value))} className="w-24" />
                </div>
                <button type="button" className="btn" disabled={pending} onClick={() => mutate((p) => addBreak(p, { label: breakLabel, durationMin: breakMin }))}>{T.addBreak}</button>
                <div className="flex flex-col gap-1">
                  <label htmlFor="note-text" className="text-sm font-bold">{T.noteLabel}</label>
                  <input id="note-text" value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder={T.notePlaceholder} className="w-44" />
                </div>
                <button type="button" className="btn" disabled={pending} onClick={() => mutate((p) => addNote(p, noteText))}>{T.addNote}</button>
                <div className="flex flex-col gap-1">
                  <label htmlFor="all-breaks" className="text-sm font-bold">{T.allBreaks}</label>
                  <input id="all-breaks" type="number" min={0} value={allBreaks} onChange={(e) => setAllBreaks(Number(e.target.value))} className="w-24" />
                </div>
                <button type="button" className="btn" disabled={pending} onClick={() => mutate((p) => p.items.reduce((acc, i) => (i.kind === "heat" && !liveStarted(i.id) ? setBreakAfter(acc, i.id, allBreaks, lives) : acc), p))}>{T.applyAllBreaks}</button>
              </div>

              {table.rows.length === 0 ? <p className="panel font-semibold">{T.emptyRun}</p> : null}
              <ol className="flex flex-col gap-2" data-testid="run-order">
                {table.rows.map((r, idx) => {
                  const started = liveStarted(r.itemId);
                  return (
                    <RowShell key={r.itemId} id={r.itemId} problem={r.issue ? r.warnings[0] : undefined}>
                      <span className="w-7 text-center font-extrabold" aria-hidden>{idx + 1}</span>
                      {r.kind === "heat" ? (
                        <span className="min-w-0 flex-1 basis-56 font-bold" data-testid="row-label">
                          {[r.division, r.round, r.heat].filter(Boolean).join(" · ") || T.goneHeat}
                        </span>
                      ) : (
                        <input
                          aria-label={T.rowLabel(idx + 1)}
                          className="min-w-0 flex-1 basis-56 !font-bold"
                          defaultValue={r.label}
                          key={r.label}
                          onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== r.label && mutate((p) => renameItem(p, r.itemId, e.target.value))}
                        />
                      )}
                      {r.kind === "heat" && r.warmUpMin > 0 ? <span className="text-sm font-bold" data-testid="row-warmup">{T.warmUpAt(r.warmUpStart ?? "–")}</span> : null}
                      {r.kind !== "note" ? (
                        pinning === r.itemId ? (
                          <span className="flex items-center gap-1">
                            <input type="time" aria-label={T.pinTimeLabel(idx + 1)} value={pinTime} onChange={(e) => setPinTime(e.target.value)} className="w-32" />
                            <button type="button" className="btn btn-primary !min-h-[40px]" disabled={!pinTime} onClick={() => { mutate((p) => setPin(p, r.itemId, pinTime, lives)); setPinning(null); }}>{T.pin}</button>
                            {r.pinned ? <button type="button" className="btn !min-h-[40px]" onClick={() => { mutate((p) => setPin(p, r.itemId, null, lives)); setPinning(null); }}>{T.unpin}</button> : null}
                            <button type="button" className="btn !min-h-[40px]" onClick={() => setPinning(null)}>{copy.common.cancel}</button>
                          </span>
                        ) : (
                          <button type="button" className="btn !min-h-[40px]" disabled={started} aria-label={T.startButton(idx + 1, r.start ?? "–")} data-testid="row-start" onClick={() => { setPinning(r.itemId); setPinTime(r.start ?? ""); }}>
                            {r.pinned ? "📌 " : ""}
                            {r.start ?? "–"}
                          </button>
                        )
                      ) : (
                        <span className="font-bold">{r.start ?? "–"}</span>
                      )}
                      {r.kind !== "note" ? (
                        <label className="flex items-center gap-1 text-sm font-bold">
                          {T.durationShort}
                          <input type="number" min={1} step="any" disabled={started} aria-label={T.durationLabel(idx + 1)} defaultValue={r.durationMin} key={`${r.itemId}-d-${r.durationMin}`} className="w-20" onBlur={(e) => Number(e.target.value) !== r.durationMin && Number(e.target.value) > 0 && mutate((p) => setDuration(p, r.itemId, Number(e.target.value), lives))} />
                        </label>
                      ) : null}
                      {r.kind !== "note" ? <span className="text-sm font-bold" data-testid="row-end">{T.endAt(r.end ?? "–")}</span> : null}
                      {r.kind === "heat" ? (
                        <label className="flex items-center gap-1 text-sm font-bold">
                          {T.breakShort}
                          <input type="number" min={0} step="any" aria-label={T.breakAfterLabel(idx + 1)} defaultValue={r.breakAfterMin ?? ""} key={`${r.itemId}-b-${r.breakAfterMin}`} placeholder={String(r.breakAfterMin ?? "")} className="w-20" onBlur={(e) => e.target.value !== "" && Number(e.target.value) !== r.breakAfterMin && mutate((p) => setBreakAfter(p, r.itemId, Number(e.target.value), lives))} />
                        </label>
                      ) : null}
                      <span className="text-sm font-extrabold" data-testid="row-status">{T.status[r.status]}</span>
                      <button type="button" className="btn !min-h-[40px] !px-3" disabled={pending || started || idx === 0} aria-label={T.moveUp(idx + 1)} onClick={() => mutate((p) => nudgeItem(p, r.itemId, -1, lives))}>↑</button>
                      <button type="button" className="btn !min-h-[40px] !px-3" disabled={pending || started || idx === table.rows.length - 1} aria-label={T.moveDown(idx + 1)} onClick={() => mutate((p) => nudgeItem(p, r.itemId, 1, lives))}>↓</button>
                      {r.kind === "heat" && !started ? <button type="button" className="btn !min-h-[40px] !px-3" aria-expanded={openRow === r.itemId} onClick={() => setOpenRow(openRow === r.itemId ? null : r.itemId)}>⋯</button> : null}
                      <button type="button" className="btn !min-h-[40px] !px-3" disabled={pending || started} aria-label={T.removeRow(idx + 1)} onClick={() => mutate((p) => removeItem(p, r.itemId, lives))}>✕</button>
                    </RowShell>
                  );
                })}
              </ol>
              {table.rows.map((r) => {
                if (openRow !== r.itemId || r.kind !== "heat") return null;
                const it = plan.items.find((i) => i.id === r.itemId);
                return (
                  <div key={`x-${r.itemId}`} className="panel flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1 font-bold">
                      {T.warmUpRow}
                      <input type="number" min={0} step="any" defaultValue={r.warmUpMin} className="w-24" onBlur={(e) => e.target.value !== "" && mutate((p) => setWarmUp(p, r.itemId, Number(e.target.value), lives))} />
                    </label>
                    {it && it.kind === "heat" ? <span className="text-sm font-semibold">{infoById.get(it.heatId!)?.heat}</span> : null}
                  </div>
                );
              })}

              <div className="panel flex flex-col gap-3" data-testid="live-overrides">
                <h3 className="text-lg font-extrabold">{T.liveHeading}</h3>
                <p className="text-sm font-semibold">{T.liveNote}</p>
                <div className="flex flex-wrap items-end gap-3">
                  {plan.hold ? (
                    <>
                      <div className="flex flex-col gap-1">
                        <label htmlFor="resume-at" className="text-sm font-bold">{T.resumeAt}</label>
                        <input id="resume-at" type="time" value={resumeAt} onChange={(e) => setResumeAt(e.target.value)} className="w-32" />
                      </div>
                      <button type="button" className="btn btn-primary" disabled={pending || !resumeAt} onClick={() => currentRow && live(() => resumePlanAtAction(currentRow.id, resumeAt))}>{T.resume}</button>
                    </>
                  ) : (
                    <button type="button" className="btn" disabled={pending || !currentRow?.active} onClick={() => currentRow && live(() => holdPlanAction(currentRow.id))}>{T.hold}</button>
                  )}
                  {[5, 10].map((m) => (
                    <button key={m} type="button" className="btn" disabled={pending || !currentRow?.active || Boolean(plan.hold)} onClick={() => currentRow && live(() => shiftPlanAction(currentRow.id, m))}>
                      {T.shift(m)}
                    </button>
                  ))}
                </div>
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
