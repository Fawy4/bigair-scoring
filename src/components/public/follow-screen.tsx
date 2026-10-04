"use client";

import { useCallback, useEffect, useState } from "react";
import { ClockText } from "@/components/clock-text";
import { Logo } from "@/components/public/logo";
import { RiderLabel } from "@/components/rider-label";
import { HeatClock } from "@/components/public/heat-clock";
import { BigScreenFlag } from "@/components/public/public-flag";
import { ScoreBox } from "@/components/public/heat-summary";
import { ScreenFrame } from "@/components/public/screen-frame";
import type { FollowHeat, FollowPayload } from "@/lib/public/follow-load";
import type { FollowPage } from "@/lib/public/follow-model";
import type { LadderHeatVM } from "@/lib/public/ladder-model";
import type { RiderRowVM } from "@/lib/public/results-model";
import { copy } from "@/lib/ui-copy";

const F = copy.pub.follow;
const R = copy.pub.results;
const L = copy.pub.ladder;

/** The screen asks for fresh data every second (the shared 3-second answers on the server keep that cheap); a request that has not answered in 5 seconds counts as lost. */
export const FOLLOW_POLL_MS = 1000;
const LOST_AFTER_MS = 5000;

const nameOf = (r: RiderRowVM): string => r.placeholder ?? "";

/** The riders of the heat on the water or waiting for the judges: place (when live totals are shown), Rider label with its Lycra colour, total. */
function LiveRiders({ riders }: { riders: RiderRowVM[] }) {
  return (
    <ol data-testid="follow-live-riders" className="flex flex-col">
      {riders.map((r, i) => (
        <li key={r.entryId ?? `seat-${i}`} data-testid="follow-rider" className="flex items-center gap-[2vw] border-b border-[var(--bs-line)] py-[0.5vw]">
          <span className="w-[4vw] shrink-0 text-center text-[3.4vw] font-semibold leading-none tabular-nums">{r.place ?? ""}</span>
          <div className="min-w-0 flex-1">{r.label ? <RiderLabel model={r.label} variant="live" bare wrap screen /> : <span className="break-words text-[2.8vw] font-semibold">{nameOf(r)}</span>}</div>
          {r.totalLabel ? <span data-testid="follow-total" className="shrink-0 text-[5vw] font-semibold leading-none tabular-nums">{r.totalLabel}</span> : null}
        </li>
      ))}
    </ol>
  );
}

function LiveHeat({ heat, serverNow, reviewing }: { heat: FollowHeat; serverNow: string; reviewing: boolean }) {
  return (
    <div data-testid={reviewing ? "follow-reviewing-page" : "follow-live-page"} data-heat={heat.id} className="flex h-full flex-col gap-[1.2vw]">
      <div className="flex items-baseline justify-between gap-[2vw]">
        <h2 data-testid="follow-title" className="min-w-0 break-words text-[3.4vw] font-semibold leading-tight">
          {heat.title}
        </h2>
        {reviewing ? null : <HeatClock leftWord={copy.pub.home.left} pausedWord={copy.pub.home.paused} startedAt={heat.clock.startedAt} durationSec={heat.clock.durationSec} pausedAt={heat.clock.pausedAt} pausedTotalSec={heat.clock.pausedTotalSec} status={heat.clock.status} serverNow={serverNow} className="shrink-0 text-[7.5vw] font-semibold leading-none tabular-nums" />}
      </div>
      {reviewing ? (
        <p data-testid="follow-reviewing" role="status" className="rounded-[1vw] border-[0.35vw] border-[var(--bs-ink)] px-[2vw] py-[0.8vw] text-center text-[6vw] font-semibold leading-tight">
          {F.reviewing}
        </p>
      ) : null}
      {!heat.scoresShown && !reviewing ? <p className="text-[2.4vw] font-semibold">{copy.pub.live.scoresAfter}</p> : null}
      <LiveRiders riders={heat.riders} />
    </div>
  );
}

function PageHead({ title, aside, part, parts, testId }: { title: string; aside?: string; part: number; parts: number; testId: string }) {
  return (
    <h2 data-testid={testId} className="mb-[0.8vw] flex flex-wrap items-baseline gap-x-[1.5vw] text-[3vw] font-semibold leading-tight">
      <span className="min-w-0 break-words">{title}</span>
      {aside ? <span data-testid="follow-published" className="text-[2.4vw] font-semibold text-[var(--bs-muted)]">{aside}</span> : null}
      {parts > 1 ? <span data-testid="follow-part" className="text-[2.4vw] font-semibold text-[var(--bs-muted)]">{F.partOf(part, parts)}</span> : null}
    </h2>
  );
}

/** One heat's result as the public results page shows it (the same rows, boxes and formula line, the same attempt-box mode), drawn large for a TV. */
function ResultsPage({ page }: { page: Extract<FollowPage, { kind: "results" }> }) {
  return (
    <div data-testid="follow-results-page" data-heat={page.heatId} className="flex h-full flex-col">
      <PageHead testId="follow-title" title={page.title} aside={F.publishedAt(page.publishedAt)} part={page.part} parts={page.parts} />
      {page.riders.map((r, i) => (
        <article key={r.entryId ?? `seat-${i}`} data-testid="follow-rider" data-place={r.place ?? undefined} className="flex flex-col gap-[0.3vw] border-b border-[var(--bs-line)] py-[0.3vw]">
          <div className="flex items-center gap-[1.5vw]">
            <span className="w-[4vw] shrink-0 text-center text-[3vw] font-semibold leading-none tabular-nums" aria-label={r.place !== null ? R.place(r.place) : undefined}>
              {r.place ?? ""}
            </span>
            <div className="min-w-0 flex-1">{r.label ? <RiderLabel model={r.label} variant="live" bare wrap screen /> : <span className="break-words text-[2.8vw] font-semibold">{nameOf(r)}</span>}</div>
            {r.state !== "ok" ? <span className="shrink-0 rounded-[0.5vw] border-[0.15vw] border-[var(--bs-line)] px-[0.8vw] text-[2vw] font-semibold">{R.notRiding[r.state]}</span> : null}
            {r.totalLabel ? <span data-testid="follow-total" className="shrink-0 text-[3.2vw] font-semibold leading-none tabular-nums">{r.totalLabel}</span> : null}
          </div>
          {r.formula ? (
            <p data-testid="follow-formula" className="break-words pl-[5.5vw] text-[1.8vw] font-medium leading-tight text-[var(--bs-muted)]">
              {r.formula}
              {r.percentLabel ? ` · ${r.percentLabel}` : ""}
            </p>
          ) : null}
          {r.boxes.length ? (
            <div className="flex flex-wrap gap-[0.5vw] pl-[5.5vw]">
              {r.boxes.map((b) => (
                <ScoreBox key={b.seq} box={b} counted={page.countedScores} mode={page.mode} screen />
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

const STATE = { complete: L.complete, live: L.live, scheduled: L.scheduled };

function LadderCard({ heat }: { heat: LadderHeatVM }) {
  return (
    <article data-testid="ladder-heat" data-state={heat.state} className="overflow-hidden rounded-[0.7vw] border-[0.15vw] border-[var(--bs-line)]">
      <header className="flex min-h-[3.2vw] items-center justify-between gap-[1vw] px-[1vw] py-[0.2vw]">
        <span className="min-w-0 break-words text-[2.4vw] font-semibold leading-tight">{heat.name}</span>
        <span className="shrink-0 text-[2vw] font-semibold text-[var(--bs-muted)]">{STATE[heat.state]}</span>
      </header>
      {heat.riders.map((r, i) => (
        <div
          key={i}
          data-testid="ladder-rider"
          data-placeholder={r.placeholder}
          className="flex min-h-[3.2vw] items-center justify-between gap-[1vw] px-[1vw] py-[0.2vw] text-[2.2vw] font-semibold leading-tight"
          style={r.hex ? { backgroundColor: r.hex, color: r.ink } : { backgroundColor: "rgb(128 128 128 / 0.25)", color: "var(--bs-ink)" }}
        >
          <span className="min-w-0 break-words">
            {r.colourWord ? <span className="mr-[0.6vw] text-[1.8vw] font-semibold uppercase tracking-wide">{r.colourWord}</span> : null}
            {r.name}
            {r.walkover ? " · DNS" : ""}
          </span>
          <span className="shrink-0 tabular-nums">{r.totalLabel}</span>
        </div>
      ))}
    </article>
  );
}

/** The division's ladder, in pages round by round when it does not fit at the TV size. */
function LadderPage({ page }: { page: Extract<FollowPage, { kind: "ladder" }> }) {
  return (
    <div data-testid="follow-ladder-page" data-division={page.divisionId} className="flex h-full flex-col">
      <PageHead testId="follow-title" title={`${F.ladder} · ${page.title}`} part={page.part} parts={page.parts} />
      <div className="grid grid-cols-2 gap-[2vw]">
        {page.columns.map((col, ci) => (
          <div key={ci} className="flex min-w-0 flex-col gap-[0.8vw]">
            {col.map((block, bi) => (
              <section key={bi} aria-label={block.name} className="flex flex-col gap-[0.5vw]">
                <h3 className="self-start rounded-full border-[0.15vw] border-[var(--bs-line)] px-[1.2vw] text-[2.2vw] font-semibold leading-[3.2vw]">{block.name}</h3>
                {block.heats.map((h) => (
                  <LadderCard key={h.id} heat={h} />
                ))}
              </section>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * "Big screen — Follow the heat": a TV page that stays on the heat while it is armed or running, says "Judges reviewing" until the head judge publishes, and then
 * walks Results (the newest published heat, then each earlier one of the day) and Ladder; arming the next heat takes it straight back to the live heat. It asks the
 * server every second and keeps the last good page when the connection drops (a small "Reconnecting" mark, never a blank or an error page). Space pauses the walk, F
 * toggles full screen, D (or the quiet control on mouse move) switches Day / Dark.
 */
export function FollowScreen({ slug, initial, qr, pollMs = FOLLOW_POLL_MS }: { slug: string; initial: FollowPayload; qr: React.ReactNode; pollMs?: number }) {
  const [payload, setPayload] = useState<FollowPayload>(initial);
  const [offline, setOffline] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const { phase, pages, rotateSec, walkKey } = payload;
  const count = pages.length;

  useEffect(() => {
    let busy = false;
    const tick = async () => {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), LOST_AFTER_MS);
      try {
        const res = await fetch(`/screen/${encodeURIComponent(slug)}/follow/data`, { cache: "no-store", signal: ctl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { payload?: FollowPayload };
        if (!body.payload) throw new Error("empty");
        setPayload(body.payload);
        setOffline(false);
      } catch {
        setOffline(true); // keep the last good page
      } finally {
        clearTimeout(timer);
        busy = false;
      }
    };
    const id = setInterval(() => void tick(), pollMs);
    const onBack = () => void tick();
    const onOffline = () => setOffline(true);
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("online", onBack);
    window.addEventListener("offline", onOffline);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("online", onBack);
      window.removeEventListener("offline", onOffline);
    };
  }, [slug, pollMs]);

  // a new heat published, or the screen has just come back to the rotation: the walk starts again from the newest heat
  useEffect(() => setIndex(0), [walkKey, phase.kind]);
  useEffect(() => {
    if (paused || phase.kind !== "rotation" || count < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), Math.max(5, rotateSec) * 1000);
    return () => clearInterval(id);
  }, [paused, phase.kind, count, rotateSec, walkKey]);

  const toggleFullscreen = useCallback(() => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    } catch {
      /* the browser refused: nothing to do */
    }
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "Space") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === "f" || e.key === "F") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen]);

  const page = pages.length ? pages[Math.min(index, pages.length - 1)] : null;
  const inRotation = phase.kind === "rotation";

  return (
    <ScreenFrame defaultMode={payload.defaultMode} labels={{ toggleToDay: F.modeDay, toggleToDark: F.modeDark }}>
      <div data-testid="follow-screen" data-phase={phase.kind} data-index={index} data-paused={paused} data-offline={offline} className="flex min-h-0 flex-1 flex-col">
        <header data-testid="screen-header" className="mb-[1.2vw] flex flex-wrap items-center gap-x-[2vw] gap-y-[0.6vw]">
          {payload.logoUrl ? (
            <span className="rounded-[0.8vw] border border-[var(--bs-line)] bg-white p-[0.5vw]">
              <Logo src={payload.logoUrl} alt={payload.eventName} height={48} maxWidth={160} priority />
            </span>
          ) : null}
          <h1 data-testid="screen-event-name" className="min-w-[26vw] flex-1 basis-[26vw] break-words text-[2.4vw] font-semibold leading-tight">
            {payload.eventName}
          </h1>
          {payload.flag ? <BigScreenFlag data={payload.flag} /> : null}
          <ClockText timezone={payload.timezone} serverNow={payload.serverNow} className={payload.flag ? "shrink-0 !text-[2vw] !text-[var(--bs-muted)]" : "ml-auto shrink-0 !text-[2vw] !text-[var(--bs-muted)]"} />
          {offline ? (
            <span data-testid="follow-reconnecting" role="status" className="shrink-0 rounded-full border-[0.15vw] border-[var(--bs-line)] px-[1.2vw] text-[2vw] font-semibold">
              {F.reconnecting}
            </span>
          ) : null}
        </header>
        <main data-testid="follow-body" className="min-h-0 flex-1 overflow-hidden">
          {phase.kind !== "rotation" && payload.heat ? (
            <LiveHeat heat={payload.heat} serverNow={payload.serverNow} reviewing={phase.kind === "reviewing"} />
          ) : page ? (
            page.kind === "results" ? <ResultsPage page={page} /> : <LadderPage page={page} />
          ) : (
            <p data-testid="follow-waiting" className="text-[4vw] font-semibold">
              {F.waiting}
            </p>
          )}
        </main>
        {paused && inRotation ? (
          <p data-testid="screen-paused" className="absolute bottom-[1vw] left-1/2 z-10 -translate-x-1/2 rounded-full border-[0.2vw] border-[var(--bs-ink)] bg-[var(--bs-bg)] px-[2vw] py-[0.3vw] text-[1.8vw] font-semibold">
            {F.pause}
          </p>
        ) : null}
        <footer className="mt-[1vw] flex items-end gap-[2vw]">
          {/* the left corner stays empty: the quiet Day / Dark control appears there and never lands on text */}
          <div aria-hidden className="w-[16vw] shrink-0" />
          <p data-testid="follow-next" className="min-w-0 flex-1 break-words text-[2.4vw] font-semibold leading-tight">
            {inRotation ? payload.next : null}
          </p>
          <aside className="flex shrink-0 items-end gap-[1vw]">
            {qr}
            <p data-testid="screen-qr-note" className="max-w-[12vw] break-words text-[1.4vw] font-semibold leading-tight">
              {F.qr}
            </p>
          </aside>
        </footer>
      </div>
    </ScreenFrame>
  );
}
