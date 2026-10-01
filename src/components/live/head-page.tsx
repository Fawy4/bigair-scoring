"use client";

import { useEffect, useMemo, useState } from "react";
import { HeatControl } from "./heat-control";
import { JudgeScreen } from "./judge-screen";
import { useEndAtZero, useTimerSound, useWakeLock } from "./live-hooks";
import { LiveShell, ScreenSettings, useLiveSettings } from "./live-shell";
import { useLiveHeat } from "./use-live-heat";
import { useServerClock, useTick } from "./use-server-clock";
import { SeatHeartbeat } from "@/app/seat/heartbeat";
import { RiderLabel } from "@/components/rider-label";
import { riderTotals } from "@/lib/live/head-totals";
import { nextHeat } from "@/lib/live/next-heat";
import { activePlanFor, heatTitle, livesFor, timetableOptions } from "@/lib/live/run-order";
import { ridersForHeat } from "@/lib/live/screen-model";
import { remainingMs } from "@/lib/live/timer";
import type { LiveContext } from "@/lib/live/types";
import { createClient } from "@/lib/supabase/browser";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const T = copy.head;

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

export function HeadRoot({ ctx }: { ctx: LiveContext }) {
  return (
    <LiveShell soundDefault>
      <HeadPage ctx={ctx} />
    </LiveShell>
  );
}

/**
 * The head judge's page (docs/PLAN-phase-5 step 1: the minimal console): the run order and the heat buttons, and the rider totals as they come in. It works
 * on a phone from the start. A head judge who also scores has one login and two tabs on a phone: Score (a judge's queue) and Control.
 */
function HeadPage({ ctx }: { ctx: LiveContext }) {
  const supabase = useMemo(() => createClient(), []);
  const clock = useServerClock(supabase);
  const nowServer = useTick(clock.now);
  const settings = useLiveSettings();
  const wide = useWide();
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"score" | "control">("control");
  const live = useLiveHeat(supabase, ctx, nowServer, selected);
  const viewer = ctx.viewer;
  const seatId = viewer.kind === "seat" ? viewer.seatId : null;
  const scores = Boolean(seatId && ctx.divisions.some((d) => d.panelSeatIds.includes(seatId)));

  // nothing picked: follow the running heat, else the next one on the run order
  const plan = activePlanFor(ctx.plans, ctx.event.timezone, nowServer);
  const upcoming = useMemo(
    () => (plan ? nextHeat(plan.plan, livesFor(ctx, live.heats, ctx.heatMeta), timetableOptions(plan, ctx.event.timezone, nowServer)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan?.id, plan?.updatedAt, live.heats, Math.floor(nowServer / 15_000)],
  );
  const shownId = selected ?? live.heat?.id ?? upcoming?.heatId ?? live.heats.find((h) => h.status === "scheduled")?.id ?? null;
  const shown = live.heats.find((h) => h.id === shownId) ?? null;
  useEffect(() => {
    // the per-heat stream follows the shown heat once there is one
    if (!selected && shownId && !live.heat) setSelected(shownId);
  }, [selected, shownId, live.heat]);

  const division = ctx.divisions.find((d) => d.id === shown?.division_id);
  const remaining = shown ? remainingMs({ status: shown.status, durationSec: shown.duration_sec, startedAt: shown.started_at, pausedAt: shown.paused_at, pausedTotalSec: shown.paused_total_sec }, nowServer) : 0;
  const running = shown?.status === "running";
  useEndAtZero(supabase, shown?.id ?? null, Boolean(shown) && running && remaining <= 0, shown?.status);
  useTimerSound(remaining, Boolean(running), settings.soundOn);
  useWakeLock(Boolean(shown) && (shown!.status === "running" || shown!.status === "paused"));

  const riders = useMemo(() => ridersForHeat(ctx, division, live.slots), [ctx, division, live.slots]);
  const totals = useMemo(
    () => (division && live.heat?.id === shown?.id ? riderTotals(division.model, division.panelSeatIds, live.slots, live.attempts, live.scores, live.impressions, division.live.showPercentOfMax) : []),
    [division, live.heat?.id, shown?.id, live.slots, live.attempts, live.scores, live.impressions],
  );

  const control = (
    <div className="flex flex-col gap-3">
      <HeatControl ctx={ctx} heats={live.heats} selectedId={shownId} onSelect={setSelected} nowServer={nowServer} plans={ctx.plans} />
      <section data-testid="rider-totals" aria-label={copy.heatControl.totals} className="flex flex-col gap-1.5">
        <h2 className="text-heading font-semibold text-beach-muted">{copy.heatControl.totals}</h2>
        {totals.length === 0 || totals.every((t) => !t.formula) ? (
          <p className="text-body font-medium text-beach-muted">{copy.heatControl.totalsNone}</p>
        ) : null}
        <ol className="flex flex-col divide-y divide-beach-line rounded-xl border border-beach-line bg-beach-bg">
          {totals.map((t) => {
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
      <ScreenSettings />
    </div>
  );

  const header = (
    <header className="border-b border-beach-line px-3 py-2">
      <h1 className="text-name font-semibold">{shown ? heatTitle(ctx, shown) : ctx.event.name}</h1>
      <p className="text-small font-medium text-beach-muted">{[ctx.event.name, viewer.kind === "seat" ? viewer.name : viewer.name].join(" · ")}</p>
    </header>
  );

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
            {control}
          </div>
        )}
      </>
    );
  }
  return (
    <div data-testid="head-page" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <SeatHeartbeat />
      {header}
      <div className="flex flex-col gap-3 px-3 py-2">{control}</div>
    </div>
  );
}
