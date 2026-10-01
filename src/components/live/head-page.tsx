"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnnouncerView } from "./announcer-view";
import { HeadLiveConsole } from "./head-live-console";
import { TieDialog } from "./head-dialogs";
import { HeadSidePanel } from "./head-side-panel";
import { DivisionSelector } from "./division-selector";
import { HeatControl, type ReviewProps } from "./heat-control";
import { JudgeScreen } from "./judge-screen";
import { useEndAtZero, useTimerSound, useWakeLock } from "./live-hooks";
import { LiveShell, ScreenSettings, useLiveSettings } from "./live-shell";
import { PracticePanel } from "./practice-panel";
import { WindCallControl } from "@/components/wind-call-control";
import { useLiveHeat } from "./use-live-heat";
import { useServerClock, useTick } from "./use-server-clock";
import { SeatHeartbeat } from "@/app/seat/heartbeat";
import { RiderLabel } from "@/components/rider-label";
import { chooseDivision, liveDivisionIds } from "@/lib/live/division-pick";
import { buildHeadModel } from "@/lib/live/head-model";
import { nextHeat } from "@/lib/live/next-heat";
import { activePlanFor, heatTitle, livesFor, timetableOptions } from "@/lib/live/run-order";
import { ridersForHeat } from "@/lib/live/screen-model";
import { effectiveStatus, remainingMs } from "@/lib/live/timer";
import type { LiveContext } from "@/lib/live/types";
import { softWord } from "@/lib/live/words";
import { createClient } from "@/lib/supabase/browser";
import { PartBoundary } from "@/components/part-boundary";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const T = copy.head;
const H = copy.headLive;

function useWide(): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 900px)");
    const set = () => setWide(m.matches);
    set();
    m.addEventListener("change", set);
    return () => m.removeEventListener("change", set);
  }, []);
  return wide;
}

export function HeadRoot({ ctx, mode }: { ctx: LiveContext; mode?: "announcer" }) {
  return (
    <LiveShell soundDefault wide>
      <HeadPage ctx={ctx} announcer={mode === "announcer" || (ctx.viewer.kind === "seat" && ctx.viewer.role === "announcer")} />
    </LiveShell>
  );
}

/**
 * The head judge's page (docs/PLAN-phase-5 steps 1, 4 and 5). On a laptop or tablet: the run order and controls on the left, the live score table with its
 * menus and dialogs in the middle, the judges, flags and audit log on the right. On a phone nothing is refused: the Control tab holds the clock, Publish, Re-open
 * and (behind Details) the rider totals and what blocks Publish; a head judge who also scores has one login and two tabs, Score and Control.
 */
function HeadPage({ ctx, announcer }: { ctx: LiveContext; announcer: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const clock = useServerClock(supabase);
  const nowServer = useTick(clock.now);
  const settings = useLiveSettings();
  const wide = useWide();
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"score" | "control">("control");
  const [details, setDetails] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tieFor, setTieFor] = useState<string[] | null>(null);
  const live = useLiveHeat(supabase, ctx, nowServer, selected);
  const viewer = ctx.viewer;
  const seatId = viewer.kind === "seat" ? viewer.seatId : null;
  const scores = Boolean(seatId && ctx.divisions.some((d) => d.panelSeatIds.includes(seatId)));
  const role = viewer.kind === "seat" ? (viewer.role as "head" | "judge" | "spotter" | "announcer") : "organiser";
  const [headExists, setHeadExists] = useState(viewer.kind === "seat");
  useEffect(() => {
    if (viewer.kind === "seat") return;
    // an organiser may add an attempt past the cap only when the event has no active head judge
    void Promise.resolve(supabase.from("judge_seats").select("id", { count: "exact", head: true }).eq("event_id", ctx.event.id).eq("role", "head").eq("active", true).eq("status", "active")).then((r) => setHeadExists((r.count ?? 0) > 0));
  }, [supabase, ctx.event.id, viewer.kind]);

  // nothing picked: follow the running heat, else the next one on the run order
  const plan = activePlanFor(live.plans, ctx.event.timezone, nowServer);
  const upcoming = useMemo(
    () => (plan ? nextHeat(plan.plan, livesFor(ctx, live.heats, ctx.heatMeta), timetableOptions(plan, ctx.event.timezone, nowServer)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan?.id, plan?.updatedAt, live.heats, Math.floor(nowServer / 15_000)],
  );
  // ---- one division at a time (Phase 7a, 8e). The choice is made once on arrival, remembered on this device, and never changed by a heat starting elsewhere.
  const canSeeAll = viewer.kind === "organiser";
  const storeKey = `bigair.head-division.${ctx.event.id}`;
  const effHeats = useMemo(
    () => live.heats.map((h) => ({ id: h.id, division_id: h.division_id, status: effectiveStatus({ status: h.status, durationSec: h.duration_sec, startedAt: h.started_at, pausedAt: h.paused_at, pausedTotalSec: h.paused_total_sec }, nowServer) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live.heats, Math.floor(nowServer / 1000)],
  );
  const upcomingDivisionId = upcoming ? (live.heats.find((h) => h.id === upcoming.heatId)?.division_id ?? null) : null;
  const [picked, setPicked] = useState<string | null>(null);
  const readStored = (): string | null => {
    try {
      return window.localStorage.getItem(storeKey);
    } catch {
      return null;
    }
  };
  useEffect(() => {
    if (picked === null) setPicked(chooseDivision({ divisions: ctx.divisions, heats: effHeats, upcomingDivisionId, stored: readStored(), canSeeAll }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- decided once, on arrival
  }, [picked]);
  const pickId = picked ?? chooseDivision({ divisions: ctx.divisions, heats: effHeats, upcomingDivisionId, stored: null, canSeeAll });
  const chooseDiv = (id: string) => {
    setPicked(id);
    setSelected(null);
    try {
      window.localStorage.setItem(storeKey, id);
    } catch {
      /* not remembered; still works until the page closes */
    }
  };
  const inPick = (heatId: string | undefined | null) => pickId === "all" || (heatId ? live.heats.find((h) => h.id === heatId)?.division_id === pickId : false);
  const upcomingHere = useMemo(
    () => (pickId !== "all" && plan ? nextHeat(plan.plan, livesFor(ctx, live.heats, ctx.heatMeta), timetableOptions(plan, ctx.event.timezone, nowServer), (id) => inPick(id)) : upcoming),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pickId, plan?.id, plan?.updatedAt, live.heats, Math.floor(nowServer / 15_000)],
  );
  const hereHeat = (status: string) => effHeats.find((h) => h.status === status && inPick(h.id))?.id;
  const shownId =
    pickId === "all"
      ? (selected ?? live.heat?.id ?? upcoming?.heatId ?? live.heats.find((h) => h.status === "scheduled")?.id ?? null)
      : ((selected && inPick(selected) ? selected : null) ?? hereHeat("running") ?? hereHeat("paused") ?? upcomingHere?.heatId ?? live.heats.find((h) => h.status === "scheduled" && inPick(h.id))?.id ?? null);
  const shown = live.heats.find((h) => h.id === shownId) ?? null;
  useEffect(() => {
    // the per-heat stream follows the shown heat once there is one
    if (pickId === "all") {
      if (!selected && shownId && !live.heat) setSelected(shownId);
    } else if (shownId && shownId !== selected) setSelected(shownId);
  }, [selected, shownId, live.heat, pickId]);

  const division = ctx.divisions.find((d) => d.id === shown?.division_id);
  const remaining = shown ? remainingMs({ status: shown.status, durationSec: shown.duration_sec, startedAt: shown.started_at, pausedAt: shown.paused_at, pausedTotalSec: shown.paused_total_sec }, nowServer) : 0;
  const running = shown?.status === "running";
  useEndAtZero(supabase, shown?.id ?? null, Boolean(shown) && running && remaining <= 0, shown?.status);
  useTimerSound(remaining, Boolean(running), settings.soundOn);
  useWakeLock(Boolean(shown) && (shown!.status === "running" || shown!.status === "paused"));

  const riders = useMemo(() => ridersForHeat(ctx, division, live.slots), [ctx, division, live.slots]);
  const wordFor = useCallback((entryId: string) => softWord(riders.find((r) => r.entryId === entryId)?.label.primary.text ?? copy.headLive.riderFallback), [riders]);
  const fresh = Boolean(division && shown && live.heat?.id === shown.id);
  const head = useMemo(() => {
    if (!division || !fresh) return null;
    const labelFor = (entryId: string) => riders.find((r) => r.entryId === entryId)?.label ?? riders[0]?.label;
    return buildHeadModel({
      model: division.model,
      panelSeatIds: division.panelSeatIds,
      slots: live.slots,
      attempts: live.attempts,
      scores: live.scores,
      impressions: live.impressions,
      penalties: live.penalties,
      decisions: live.decisions.flatMap((d) => (d.kind === "tie" && Array.isArray(d.payload.riderIds) ? [{ riderIds: d.payload.riderIds, reason: d.reason ?? "" }] : [])),
      flags: live.flags,
      sheets: live.sheets,
      labelFor: labelFor as never,
      wordFor,
      showPercent: division.live.showPercentOfMax,
      flagOutCount: division.flagOut?.count,
    });
  }, [division, fresh, riders, live.slots, live.attempts, live.scores, live.impressions, live.penalties, live.decisions, live.flags, live.sheets, wordFor]);

  // Impression / Variety scores open when the heat has ended: until then nothing is owed and nothing blocks Publish
  const closing = shown ? shown.status === "ended" || shown.status === "under_review" || (shown.status === "running" && remaining <= 0) : false;
  const blockerItems = closing && head ? head.checklist.items : [];
  const onChanged = useCallback(() => {
    void live.refresh();
    setRefreshKey((k) => k + 1);
  }, [live]);
  const review: ReviewProps | undefined = head ? { items: blockerItems, canOverride: head.checklist.canOverride, riders: riders.map((r) => ({ entryId: r.entryId, word: wordFor(r.entryId), name: r.name })), onChooseOrder: setTieFor, onChanged } : undefined;

  const totalsList = (
    <section data-testid="rider-totals" aria-label={H.totalsHeading} className="flex flex-col gap-1.5">
      <h2 className="text-heading font-semibold text-beach-muted">{H.totalsHeading}</h2>
      {!head || head.totals.every((t) => !t.formula) ? <p className="text-body font-medium text-beach-muted">{copy.heatControl.totalsNone}</p> : null}
      <ol className="flex flex-col divide-y divide-beach-line rounded-xl border border-beach-line bg-beach-bg">
        {(head?.totals ?? []).map((t) => {
          const r = riders.find((x) => x.entryId === t.entryId);
          return (
            <li key={t.entryId} data-testid="total-row" data-entry={t.entryId} className="flex flex-col gap-0.5 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1">{r ? <RiderLabel model={r.label} variant="live" bare /> : null}</span>
                <span data-testid="total-value" className="shrink-0 text-readout font-bold tabular-nums">
                  {t.totalLabel}
                </span>
              </div>
              {t.formula ? (
                <p data-testid="total-formula" className="text-small font-medium text-beach-muted">
                  {t.formula}
                  {t.percentLabel ? ` · ${t.percentLabel}` : ""}
                </p>
              ) : null}
              <p className="text-small font-medium text-beach-muted">
                {copy.heatControl.attemptsOf(t.attempts, t.cap)}
                {t.incomplete && t.formula ? ` · ${copy.heatControl.stillChanging}` : ""}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );

  // phone: the blocker list and the ties, in words
  const blockers = head ? (
    <section data-testid="phone-blockers" aria-label={H.blockersHeading} className="flex flex-col gap-1">
      <h2 className="text-heading font-semibold text-beach-muted">{blockerItems.length ? H.blockersHeading : H.nothingBlocks}</h2>
      {blockerItems.map((b) => (
        <p key={b.text} className="rounded-lg border border-beach-outlier bg-beach-bg px-2 py-0.5 text-body font-medium">
          {b.text}
        </p>
      ))}
      {head.ties.map((t) => (
        <div key={t.text} className="flex flex-col gap-1">
          <p className="text-body font-medium">{t.text}</p>
          {t.unresolved || t.shared ? (
            <button type="button" data-testid="choose-order" className="min-h-[48px] rounded-xl border border-beach-border bg-beach-bg px-3 text-body font-semibold" onClick={() => setTieFor(t.riderIds)}>
              {H.chooseOrder}
            </button>
          ) : null}
        </div>
      ))}
    </section>
  ) : null;

  const controlColumn = (
    <div className="flex flex-col gap-3">
      {!announcer ? <WindCallControl eventId={ctx.event.id} /> : null}
      <PartBoundary what={copy.crash.parts.timetable}>
        <HeatControl ctx={ctx} heats={live.heats} divisionId={pickId === "all" ? null : pickId} selectedId={shownId} onSelect={setSelected} nowServer={nowServer} plans={live.plans} onPlanChanged={live.applyPlan} review={review} />
      </PartBoundary>
      {!wide ? (
        <>
          <button type="button" data-testid="details-toggle" aria-expanded={details} onClick={() => setDetails((d) => !d)} className="min-h-[48px] rounded-xl border border-beach-border bg-beach-bg px-3 text-body font-semibold">
            {details ? H.detailsHide : H.details}
          </button>
          {details ? (
            <div data-testid="details" className="flex flex-col gap-3">
              {totalsList}
              {blockers}
              <p className="text-small font-medium text-beach-muted">{H.phoneTable}</p>
            </div>
          ) : null}
        </>
      ) : null}
      {ctx.event.isSimulation && viewer.kind === "organiser" ? <PracticePanel ctx={ctx} heat={shown} division={division} attempts={live.attempts} riderIds={riders.filter((r) => r.riding).map((r) => r.entryId)} /> : null}
      <ScreenSettings />
    </div>
  );

  const header = (
    <header className="border-b border-beach-line px-3 py-2">
      <h1 className="text-name font-semibold">{shown ? heatTitle(ctx, shown) : ctx.event.name}</h1>
      <p className="text-small font-medium text-beach-muted">{[ctx.event.name, viewer.name].join(" · ")}</p>
      <div className="mt-2">
        <DivisionSelector divisions={ctx.divisions} value={pickId} liveIds={liveDivisionIds(effHeats)} canSeeAll={canSeeAll} wide={wide} onChange={chooseDiv} />
      </div>
    </header>
  );

  const tieDialog =
    tieFor && shown ? (
      <TieDialog
        heatId={shown.id}
        riders={tieFor.map((id) => ({ id, word: wordFor(id) }))}
        onClose={() => setTieFor(null)}
        onDone={() => {
          setTieFor(null);
          onChanged();
        }}
      />
    ) : null;

  // the announcer's view: the heat that is on, read-only
  if (announcer) {
    return (
      <div data-testid="head-page" data-layout="announcer" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <SeatHeartbeat />
        {shown && division && head ? <AnnouncerView ctx={ctx} heat={shown} division={division} attempts={live.attempts} riders={riders} head={head} wordFor={wordFor} /> : <p className="px-3 py-2 text-body font-medium text-beach-muted">{H.noHeat}</p>}
      </div>
    );
  }

  // a phone with a head judge who also scores: Score and Control tabs; otherwise the page is just the controls
  if (!wide && scores) {
    return (
      <>
        <SeatHeartbeat />
        <div role="tablist" aria-label={T.tabsLabel} className="grid grid-cols-2 border-b border-beach-line bg-beach-bg">
          {(["score", "control"] as const).map((t) => (
            <button key={t} type="button" role="tab" data-tab={t} aria-selected={tab === t} onClick={() => setTab(t)} className={cn("min-h-tap text-body font-semibold", tab === t ? "border-b-2 border-beach-accent text-beach-ink" : "border-b-2 border-transparent text-beach-muted")}>
              {t === "score" ? T.tabScore : T.tabControl}
            </button>
          ))}
        </div>
        {tab === "score" ? (
          <JudgeScreen ctx={ctx} pinnedHeatId={null} />
        ) : (
          <div data-testid="screen-body" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-2">
            {header}
            {controlColumn}
          </div>
        )}
        {tieDialog}
      </>
    );
  }
  if (!wide) {
    return (
      <div data-testid="head-page" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <SeatHeartbeat />
        {header}
        <div className="flex flex-col gap-3 px-3 py-2">{controlColumn}</div>
        {tieDialog}
      </div>
    );
  }
  return (
    <div data-testid="head-page" data-layout="wide" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <SeatHeartbeat />
      {header}
      <div className="grid gap-3 px-3 py-2 min-[900px]:grid-cols-[18rem_minmax(0,1fr)] min-[1400px]:grid-cols-[18rem_minmax(0,1fr)_16rem]">
        <div className="min-w-0">{controlColumn}</div>
        <div className="min-w-0 overflow-x-auto">
          {shown && division && head ? (
            <HeadLiveConsole ctx={ctx} heat={shown} division={division} live={live} riders={riders} head={head} wordFor={wordFor} onChanged={onChanged} role={role} hasActiveHead={headExists} />
          ) : (
            <p className="text-body font-medium text-beach-muted">{H.noHeat}</p>
          )}
        </div>
        {shown && division && head ? (
          <div className="min-w-0 min-[900px]:col-span-2 min-[1400px]:col-span-1">
            <HeadSidePanel supabase={supabase} eventId={ctx.event.id} heat={shown} live={live} head={head} wordFor={wordFor} nowServer={nowServer} refreshKey={refreshKey} onChanged={onChanged} />
          </div>
        ) : null}
      </div>
      {tieDialog}
    </div>
  );
}
