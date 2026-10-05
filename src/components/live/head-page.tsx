"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnnouncerView } from "./announcer-view";
import { AnnouncerFlags } from "./flag-cues";
import { PhoneReview } from "./phone-review";
import { HeadLiveConsole } from "./head-live-console";
import type { FixTarget } from "@/lib/live/publish-checklist";
import { TieDialog } from "./head-dialogs";
import { BreakChoice, ControlMessage, WhyLine, SoundToggle, DivisionTabs, HeatDialogs, RunOrderList, StartWarning, TimerBar, TimingButtons, WindButton } from "./head-parts";
import { HeatControl, type ReviewProps } from "./heat-control";
import { useHeadController } from "./use-head-controller";
import { JudgeScreen } from "./judge-screen";
import { useEndAtZero, useFlagHorns, useTimerSound, useWakeLock } from "./live-hooks";
import { LiveShell, ScreenSettings, useLiveSettings } from "./live-shell";
import { PracticePanel } from "./practice-panel";
import { ExportButtons } from "@/components/export/export-buttons";
import { useLiveHeat } from "./use-live-heat";
import { useServerClock, useTick } from "./use-server-clock";
import { SeatHeartbeat } from "@/app/seat/heartbeat";
import { RiderLabel } from "@/components/rider-label";
import { nextHeatInOrder } from "@/lib/engine/schedule";
import { chooseDivision, heatToShow, isLiveHeat, liveDivisionIds, rememberedDivision } from "@/lib/live/division-pick";
import { buildHeadModel } from "@/lib/live/head-model";
import { judgeWordFor } from "@/lib/live/judge-names";
import { activePlanFor, heatTitle, livesFor } from "@/lib/live/run-order";
import { ridersForHeat } from "@/lib/live/screen-model";
import { remainingMs } from "@/lib/live/timer";
import type { LiveContext } from "@/lib/live/types";
import { softWord } from "@/lib/live/words";
import { createClient } from "@/lib/supabase/browser";
import { PartBoundary } from "@/components/part-boundary";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const T = copy.head;
const H = copy.headLive;
const V = copy.headV2;

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
 * The head judge's page (docs/PLAN-phase-5 steps 1, 4 and 5; redesigned as Console v2). On a laptop: a top bar (the division, the heat's name, the timer large
 * with Start / Pause / Resume / End beside it, the break after a heat), the run order of the division on the left, the riders and the score table in the
 * middle, the judges, blockers, Publish, Re-open and Re-run on the right; everything else is behind a toggle. On a phone nothing is refused: the Control tab
 * holds the same controls, and a head judge who also scores has one login and two tabs, Score and Control.
 */
function HeadPage({ ctx, announcer }: { ctx: LiveContext; announcer: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const clock = useServerClock(supabase);
  const nowServer = useTick(clock.now);
  const settings = useLiveSettings();
  const wide = useWide();
  const [picked, setPicked] = useState<string | null>(null);
  const [division, setDivision] = useState<string | null>(null);
  const [remembered, setRemembered] = useState<string | null>(null);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [tab, setTab] = useState<"score" | "control">("control");
  const [details, setDetails] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tieFor, setTieFor] = useState<string[] | null>(null);
  const [fixRequest, setFixRequest] = useState<{ target: FixTarget; n: number } | null>(null);
  const live = useLiveHeat(supabase, ctx, nowServer, streamId);
  const viewer = ctx.viewer;
  const seatId = viewer.kind === "seat" ? viewer.seatId : null;
  const scores = Boolean(seatId && ctx.divisions.some((d) => d.panelSeatIds.includes(seatId)));
  // Download results: the head judge's seat or an organiser, on the laptop console only (this column does not exist on a phone); never the announcer, never a practice event
  const canExport = !announcer && !ctx.event.isSimulation && (viewer.kind === "organiser" || (viewer.kind === "seat" && viewer.role === "head"));
  const role = viewer.kind === "seat" ? (viewer.role as "head" | "judge" | "spotter" | "announcer") : "organiser";
  const [headExists, setHeadExists] = useState(viewer.kind === "seat");
  useEffect(() => {
    if (viewer.kind === "seat") return;
    // an organiser may add an attempt past the cap only when the event has no active head judge
    void Promise.resolve(supabase.from("judge_seats").select("id", { count: "exact", head: true }).eq("event_id", ctx.event.id).eq("role", "head").eq("active", true).eq("status", "active")).then((r) => setHeadExists((r.count ?? 0) > 0));
  }, [supabase, ctx.event.id, viewer.kind]);
  // the division this device chose last time (read after the page is up, so the server and the browser draw the same first screen)
  useEffect(() => setRemembered(rememberedDivision.read(ctx.event.id, window.localStorage)), [ctx.event.id]);

  // one division at a time: the one chosen here, else the one with a heat running, else the one of the next heat of the run order
  const plan = activePlanFor(live.plans, ctx.event.timezone, nowServer);
  const nextHeatId = useMemo(
    () => (plan ? (nextHeatInOrder(plan.plan, livesFor(ctx, live.heats, ctx.heatMeta))?.heatId ?? null) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan?.id, plan?.updatedAt, live.heats],
  );
  const nextHeatDivision = live.heats.find((h) => h.id === nextHeatId)?.division_id ?? null;
  const divisionId = chooseDivision({ divisions: ctx.divisionTabs, heats: live.heats, nextHeatDivisionId: nextHeatDivision, remembered: division ?? remembered, nowServer });
  const liveIds = liveDivisionIds(live.heats, nowServer);
  const pickDivision = useCallback(
    (id: string) => {
      setDivision(id);
      setPicked(null);
      rememberedDivision.write(ctx.event.id, id, window.localStorage);
    },
    [ctx.event.id],
  );
  const selectHeat = useCallback(
    (id: string) => {
      const h = live.heats.find((x) => x.id === id);
      if (h && h.division_id !== divisionId) {
        setDivision(h.division_id);
        rememberedDivision.write(ctx.event.id, h.division_id, window.localStorage);
      }
      setPicked(id);
    },
    [live.heats, divisionId, ctx.event.id],
  );

  const shownId = heatToShow({ heats: live.heats, divisionId, pickedId: picked, nextHeatId, nowServer });
  const shown = live.heats.find((h) => h.id === shownId) ?? null;
  // the heat on screen stays until the head judge picks another, or a heat of this division is started (then the console follows it): a heat that has just ended
  // must not slide away to the next one before it is reviewed and published
  const followed = useRef<string | null>(null);
  useEffect(() => {
    if (!picked && shownId) setPicked(shownId);
    const running = live.heats.find((h) => h.division_id === divisionId && isLiveHeat(h, nowServer));
    if (running && followed.current !== running.id) {
      followed.current = running.id;
      if (picked !== running.id) setPicked(running.id);
    }
  }, [picked, shownId, live.heats, divisionId, nowServer]);
  useEffect(() => {
    // the per-heat stream follows the shown heat
    if (shownId !== streamId) setStreamId(shownId);
  }, [shownId, streamId]);

  const heatDivision = ctx.divisions.find((d) => d.id === shown?.division_id);
  const remaining = shown ? remainingMs({ status: shown.status, durationSec: shown.duration_sec, startedAt: shown.started_at, pausedAt: shown.paused_at, pausedTotalSec: shown.paused_total_sec }, nowServer) : 0;

  const riders = useMemo(() => ridersForHeat(ctx, heatDivision, live.slots), [ctx, heatDivision, live.slots]);
  const wordFor = useCallback((entryId: string) => softWord(riders.find((r) => r.entryId === entryId)?.label.primary.text ?? copy.headLive.riderFallback), [riders]);
  const fresh = Boolean(heatDivision && shown && live.heat?.id === shown.id);
  const head = useMemo(() => {
    if (!heatDivision || !fresh) return null;
    const labelFor = (entryId: string) => riders.find((r) => r.entryId === entryId)?.label ?? riders[0]?.label;
    return buildHeadModel({
      model: heatDivision.model,
      panelSeatIds: heatDivision.panelSeatIds,
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
      judgeWord: judgeWordFor(heatDivision.panelSeatIds, ctx.seatNames),
      showPercent: heatDivision.live.showPercentOfMax,
      flagOutCount: heatDivision.flagOut?.count,
    });
  }, [heatDivision, fresh, riders, ctx.seatNames, live.slots, live.attempts, live.scores, live.impressions, live.penalties, live.decisions, live.flags, live.sheets, wordFor]);

  // Impression / Variety scores open when the heat has ended: until then nothing is owed and nothing blocks Publish
  const closing = shown ? shown.status === "ended" || shown.status === "under_review" || (shown.status === "running" && remaining <= 0) : false;
  const blockerItems = closing && head ? head.checklist.items : [];
  const onChanged = useCallback(() => {
    void live.refresh();
    setRefreshKey((k) => k + 1);
  }, [live]);
  const review: ReviewProps | undefined = head ? { items: blockerItems, canOverride: head.checklist.canOverride, riders: riders.map((r) => ({ entryId: r.entryId, word: wordFor(r.entryId), name: r.name })), onChooseOrder: setTieFor, onChanged, ...(wide ? { onFix: (target: FixTarget) => setFixRequest({ target, n: Date.now() }) } : {}) } : undefined;

  const c = useHeadController({ ctx, heats: live.heats, plans: live.plans, nowServer, selectedId: shownId, nextHeatId, onSelect: selectHeat, onPlanChanged: live.applyPlan, onPatchHeat: live.patchHeat, review, divisionId });

  // the clock, the sound and the screen lock follow the heat that is on the water, wherever it is, else the heat shown
  const clockHeat = c.liveHeat ?? shown;
  const clockRemaining = clockHeat ? remainingMs({ status: clockHeat.status, durationSec: clockHeat.duration_sec, startedAt: clockHeat.started_at, pausedAt: clockHeat.paused_at, pausedTotalSec: clockHeat.paused_total_sec }, nowServer) : 0;
  const clockRunning = clockHeat?.status === "running";
  useEndAtZero(supabase, clockHeat?.id ?? null, Boolean(clockHeat) && clockRunning && clockRemaining <= 0, clockHeat?.status);
  useTimerSound(clockRemaining, Boolean(clockRunning) && !c.flag, settings.soundOn);
  useFlagHorns(c.flag?.state ?? null, settings.soundOn);
  useWakeLock(Boolean(clockHeat) && (clockHeat!.status === "running" || clockHeat!.status === "paused"));

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

  const practice = ctx.event.isSimulation && viewer.kind === "organiser" ? <PracticePanel ctx={ctx} heat={shown} division={heatDivision} attempts={live.attempts} riderIds={riders.filter((r) => r.riding).map((r) => r.entryId)} /> : null;

  const column = (bar: React.ReactNode, card: React.ReactNode) => (
    <div className="flex flex-col gap-3">
      {bar}
      <PartBoundary what={copy.crash.parts.timetable}>
        <HeatControl c={c} divisions={ctx.divisionTabs} divisionId={divisionId} liveIds={liveIds} onPickDivision={pickDivision} announcer={announcer} />
      </PartBoundary>
      {card}
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
      {practice}
      <ScreenSettings />
    </div>
  );
  // the review bar and the Impression card on a phone (a laptop's console draws its own)
  const controlColumn =
    !wide && shown && heatDivision && head ? (
      <PhoneReview ctx={ctx} heat={shown} division={heatDivision} head={head} live={live} riders={riders} wordFor={wordFor} supabase={supabase} nowServer={nowServer} refreshKey={refreshKey} closing={closing} onChanged={onChanged} onChooseOrder={setTieFor}>
        {({ bar, card }) => column(bar, card)}
      </PhoneReview>
    ) : (
      column(null, null)
    );

  const header = (
    <header className="border-b border-beach-line px-3 py-2">
      <h1 className="whitespace-normal break-words text-name font-semibold">{shown ? heatTitle(ctx, shown) : ctx.event.name}</h1>
      <p className="text-small font-medium text-beach-muted">{[ctx.event.name, viewer.name].join(" · ")}</p>
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
        <SeatHeartbeat simEventId={ctx.event.isSimulation ? ctx.event.id : undefined} />
        <AnnouncerFlags model={c.flag} nowMs={nowServer} timezone={ctx.event.timezone} />
        {shown && heatDivision && head ? <AnnouncerView nowMs={nowServer} ctx={ctx} heat={shown} division={heatDivision} attempts={live.attempts} riders={riders} head={head} wordFor={wordFor} /> : <p className="px-3 py-2 text-body font-medium text-beach-muted">{H.noHeat}</p>}
      </div>
    );
  }

  // a phone with a head judge who also scores: Score and Control tabs; otherwise the page is just the controls
  if (!wide && scores) {
    return (
      <>
        <SeatHeartbeat simEventId={ctx.event.isSimulation ? ctx.event.id : undefined} />
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
        <SeatHeartbeat simEventId={ctx.event.isSimulation ? ctx.event.id : undefined} />
        {header}
        <div className="flex flex-col gap-3 px-3 py-2">{controlColumn}</div>
        {tieDialog}
      </div>
    );
  }

  const liveElsewhere = c.liveHeat && c.liveHeat.id !== shownId ? c.liveHeat : null;
  return (
    <div data-testid="head-page" data-layout="wide" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <SeatHeartbeat simEventId={ctx.event.isSimulation ? ctx.event.id : undefined} />
      <header data-testid="top-bar" className="flex flex-col gap-1 border-b border-beach-line bg-beach-bg px-3 py-1.5">
        <h1 className="sr-only">{T.title}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <DivisionTabs divisions={ctx.divisionTabs} divisionId={divisionId} liveIds={liveIds} onPick={pickDivision} />
          {c.selected && c.state !== "cancelled" && !c.armed ? <BreakChoice c={c} compact /> : null}
          <div className="min-w-0 flex-1 basis-48">
            <ControlMessage c={c} />
            <WhyLine c={c} />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
            <SoundToggle on={settings.soundOn} onToggle={() => settings.setSoundOn(!settings.soundOn)} />
            <p className="text-small font-medium text-beach-muted">{[ctx.event.name, viewer.name].join(" · ")}</p>
          </div>
        </div>
        {liveElsewhere ? (
          <button type="button" data-testid="live-elsewhere" onClick={() => selectHeat(liveElsewhere.id)} className="inline-flex min-h-tap flex-wrap items-center gap-2 self-start rounded-xl border border-beach-live bg-beach-bg px-3 text-left text-body font-semibold">
            <span>{V.liveElsewhere(heatTitle(ctx, liveElsewhere))}</span>
            <span className="text-beach-muted">{V.goToLive}</span>
          </button>
        ) : null}
        <TimerBar c={c} bar />
        <StartWarning c={c} />
      </header>
      <div className="grid gap-3 px-3 py-2 min-[900px]:grid-cols-[15rem_minmax(0,1fr)]">
        <div data-testid="left-column" className="flex min-w-0 flex-col gap-2">
          <PartBoundary what={copy.crash.parts.timetable}>
            <RunOrderList c={c} divisionId={divisionId} />
          </PartBoundary>
          <TimingButtons c={c} />
          <WindButton eventId={ctx.event.id} />
          {canExport ? <ExportButtons eventId={ctx.event.id} role="head" /> : null}
        </div>
        <div className="min-w-0">
          {shown && heatDivision && head ? (
            <HeadLiveConsole
              ctx={ctx}
              heat={shown}
              division={heatDivision}
              live={live}
              riders={riders}
              head={head}
              wordFor={wordFor}
              onChanged={onChanged}
              role={role}
              hasActiveHead={headExists}
              supabase={supabase}
              nowServer={nowServer}
              refreshKey={refreshKey}
              c={c}
              extras={practice}
              fixRequest={fixRequest}
            />
          ) : (
            <p className="text-body font-medium text-beach-muted">{H.noHeat}</p>
          )}
        </div>
      </div>
      <HeatDialogs c={c} />
      {tieDialog}
    </div>
  );
}
