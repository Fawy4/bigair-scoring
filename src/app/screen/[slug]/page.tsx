import type { Metadata } from "next";
import { ClockText } from "@/components/clock-text";
import { notFound } from "next/navigation";
import { HeatClock } from "@/components/public/heat-clock";
import { BigScreenFlag } from "@/components/public/public-flag";
import { publicFlagData } from "@/lib/public/flag-data";
import { FitSlide } from "@/components/public/fit-slide";
import { Logo } from "@/components/public/logo";
import { LivePoll } from "@/components/public/poll";
import { Qr } from "@/components/public/qr";
import { ScreenFrame } from "@/components/public/screen-frame";
import { ScreenRotator } from "@/components/public/screen-rotator";
import { WindBanner } from "@/components/public/wind-banner";
import { buildPlacings } from "@/lib/public/ladder-model";
import { liveRows } from "@/lib/public/live-model";
import { Updating } from "@/components/public/updating";
import { admitPublicRequest, loadDraw, loadLive } from "@/lib/public/load";
import { loadCore } from "@/lib/public/page-data";
import { modelOf, type RiderRowVM } from "@/lib/public/results-model";
import { buildScreenSlides, type ScreenSlide } from "@/lib/public/screen-model";
import { schemeFor } from "@/lib/public/schemes";
import { eventUrl } from "@/lib/public/share";
import { timeText } from "@/components/public/timetable-list";
import { requestOrigin } from "@/lib/platform/origin";
import { copy } from "@/lib/ui-copy";

export const dynamic = "force-dynamic";

const S = copy.pub.screen;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const core = await loadCore((await params).slug);
  return { title: core ? `${S.title} · ${core.site.event.name}` : copy.pub.common.notFound, robots: { index: false, follow: false } };
}

const nameOf = (r: RiderRowVM): string => r.label?.secondary.find((x) => x.key === "name")?.text ?? r.label?.primary.text ?? r.placeholder ?? "";

function BigRider({ r }: { r: RiderRowVM }) {
  const p = r.label?.primary;
  const colour = p?.kind === "colour" && p.hex ? p : null;
  return (
    <li data-testid="screen-rider" className="flex items-center gap-[2vw] border-b border-[var(--bs-line)] py-[0.3vw]">
      <span className="w-[5vw] text-[4.5vw] font-semibold tabular-nums">{r.place ?? ""}</span>
      <span className="flex min-w-0 flex-1 items-center gap-[1.5vw]">
        {colour ? (
          <span className="rounded-[0.6vw] px-[1.2vw] text-[3vw] font-semibold" style={{ backgroundColor: colour.hex, color: colour.ink, boxShadow: colour.outlined ? "inset 0 0 0 0.25vw var(--bs-ring)" : undefined }}>
            {colour.text}
          </span>
        ) : null}
        <span className="min-w-0 break-words text-[4vw] font-semibold">{nameOf(r)}</span>
      </span>
      <span className="text-[7vw] font-semibold tabular-nums">{r.totalLabel ?? ""}</span>
    </li>
  );
}

/** The big screen for the beach or the tent: white on dark, huge digits, rotating pages, QR to the public site. No login, nothing that moves on its own except the page change. */
export default async function BigScreen({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await admitPublicRequest())) return <Updating />;
  const core = await loadCore((await params).slug);
  if (!core) notFound();
  const { site, tt, tabs, results, rules, timetable } = core;
  const origin = await requestOrigin();

  // the heat on the water: running totals when its division shows them live
  let liveRiders: RiderRowVM[] | null = null;
  const nowTab = tt.now?.heatId ? tabs.find((t) => t.id === tt.now!.heatId) : undefined;
  if (nowTab && results) {
    const live = await loadLive(nowTab.id);
    const model = modelOf(rules, nowTab.divisionId);
    if (live) liveRiders = liveRows(live, model, new Map(results.entries.map((e) => [e.id, e])), schemeFor(site, nowTab.divisionId), model?.heat.impression?.label ?? null);
  }

  // podium: a division whose last round is completely released
  const drawPayload = await loadDraw(site.event.id);
  const podiums = (results?.divisions ?? [])
    .flatMap((d) => {
      const last = d.rounds.at(-1);
      const released = last && last.heats.filter((h) => h.status !== "cancelled").length > 0 && last.heats.filter((h) => h.status !== "cancelled").every((h) => h.status === "published" && !h.held);
      if (!released) return [];
      const draw = drawPayload?.divisions.find((x) => x.id === d.id)?.draw ?? null;
      const places = buildPlacings(draw, results?.entries ?? []).filter((p) => p.place <= 3);
      return places.length ? [{ division: d.name, places, at: Math.max(...last.heats.map((h) => Date.parse(h.published_at ?? "") || 0)) }] : [];
    })
    .sort((a, b) => b.at - a.at);

  const slides = buildScreenSlides({ tt, tabs, liveRiders, podiums, sponsors: site.branding.sponsors });
  const url = eventUrl(origin, site.event.slug);
  const logo = site.branding.logoUrl ?? site.organisation.logo_url;
  const labels: Record<ScreenSlide["kind"], string> = { live: S.live, timetable: S.timetable, results: S.results, podium: S.podium, sponsors: S.sponsors };
  const flagData = publicFlagData(timetable, tt, site.settings.flags);
  const liveHeat = tt.now?.heatId ? timetable?.heats.find((h) => h.id === tt.now!.heatId) : undefined;

  const render = (s: ScreenSlide) => {
    if (s.kind === "live") {
      return (
        <div className="flex h-full flex-col gap-[1vw]">
          <div className="flex items-baseline justify-between gap-[2vw]">
            <p className="min-w-0 break-words text-[3.2vw] font-semibold">{s.title}</p>
            {liveHeat ? <HeatClock leftWord={copy.pub.home.left} pausedWord={copy.pub.home.paused} startedAt={liveHeat.started_at} durationSec={liveHeat.duration_sec} pausedAt={liveHeat.paused_at} pausedTotalSec={liveHeat.paused_total_sec} status={liveHeat.paused_at ? "paused" : "running"} serverNow={timetable!.server_now} className="shrink-0 text-[7.5vw] font-semibold leading-none tabular-nums" /> : null}
          </div>
          {!s.scoresShown ? <p className="text-[2.6vw] font-semibold">{copy.pub.live.scoresAfter}</p> : null}
          <ol className="flex flex-col">
            {s.riders.map((r, i) => (
              <BigRider key={r.entryId ?? i} r={r} />
            ))}
          </ol>
        </div>
      );
    }
    if (s.kind === "timetable") {
      return (
        <div className="flex h-full flex-col gap-[1vw]">
          <p className="text-[3.5vw] font-semibold">{S.timetable}</p>
          <ol className="flex flex-col">
            {s.rows.map((r) => (
              <li key={r.itemId} data-testid="screen-row" className="flex items-baseline justify-between gap-[2vw] border-b border-[var(--bs-line)] py-[0.4vw]">
                <span className="min-w-0 break-words text-[3.2vw] font-semibold">{r.title}</span>
                <span className="text-[4.6vw] font-semibold tabular-nums">{timeText(r)}</span>
              </li>
            ))}
          </ol>
          {s.estimates ? <p className="text-[2vw] font-semibold">{copy.pub.home.estimates}</p> : null}
        </div>
      );
    }
    if (s.kind === "results") {
      return (
        <div className="flex h-full flex-col gap-[1vw]">
          <p className="text-[3.5vw] font-semibold">
            {S.results}: {s.title}
          </p>
          <ol className="flex flex-col">
            {s.riders.map((r, i) => (
              <BigRider key={r.entryId ?? i} r={r} />
            ))}
          </ol>
        </div>
      );
    }
    if (s.kind === "podium") {
      return (
        <div data-testid="screen-podium" className="flex h-full flex-col gap-[1.5vw]">
          <p className="text-[4vw] font-semibold">
            {S.podium}: {s.division}
          </p>
          <ol className="flex flex-col gap-[1.5vw]">
            {s.places.map((p, i) => (
              <li key={i} className="flex items-baseline gap-[3vw]">
                <span className="w-[8vw] text-[8vw] font-semibold tabular-nums">{p.label}</span>
                <span className="min-w-0 break-words text-[7vw] font-semibold">{p.name}</span>
              </li>
            ))}
          </ol>
        </div>
      );
    }
    return (
      <div className="flex h-full flex-col items-center justify-center gap-[3vw]">
        <p className="text-[3.5vw] font-semibold">{S.sponsors}</p>
        <div className="flex flex-wrap items-center justify-center gap-[4vw]">
          {s.sponsors.map((sp, i) =>
            sp.logoUrl ? (
              <span key={i} className="rounded-[1vw] border-2 border-[var(--bs-line)] bg-white p-[1.2vw]">
                <Logo src={sp.logoUrl} alt={sp.name} height={110} maxWidth={320} />
              </span>
            ) : (
              <span key={i} className="text-[4vw] font-semibold">
                {sp.name}
              </span>
            ),
          )}
        </div>
      </div>
    );
  };

  return (
    <ScreenFrame defaultMode={site.settings.screenColourMode === "day" ? "day" : "dark"} labels={{ toggleToDay: S.modeDay, toggleToDark: S.modeDark }}>
      <LivePoll seconds={site.settings.livePollSec} />
      <WindBanner wind={site.wind} big />
      {/* the header fits the width, never cuts a word: the heat's flag pill takes the room it needs first, the event name takes the rest and wraps (onto its own line when it must), the clock keeps its corner */}
      <header data-testid="screen-header" className="mb-[1.5vw] flex flex-wrap items-center gap-x-[2vw] gap-y-[0.8vw]">
        {logo ? (
          <span className="rounded-[0.8vw] border border-[var(--bs-line)] bg-white p-[0.6vw]">
            <Logo src={logo} alt={site.event.name} height={64} maxWidth={200} priority />
          </span>
        ) : null}
        <h1 data-testid="screen-event-name" className={`min-w-[26vw] flex-1 basis-[26vw] break-words font-semibold ${site.event.name.length > 28 ? "text-[2.4vw]" : "text-[3vw]"}`}>
          {site.event.name}
        </h1>
        {flagData ? <BigScreenFlag data={flagData} /> : null}
        <ClockText timezone={site.event.timezone} serverNow={core.now} className={flagData ? "shrink-0 !text-[2vw] !text-[var(--bs-muted)]" : "ml-auto shrink-0 !text-[2vw] !text-[var(--bs-muted)]"} />
      </header>
      <div className="mt-[1.5vw] flex min-h-0 flex-1 pb-[5.5vw] pr-[15vw]">
        {slides.length ? (
          <ScreenRotator pausedLabel={S.pause} seconds={site.settings.screenRotateSec} labels={slides.map((s) => labels[s.kind])}>
            {slides.map((s, i) => (
              <FitSlide key={i}>{render(s)}</FitSlide>
            ))}
          </ScreenRotator>
        ) : (
          <p className="text-[4vw] font-semibold">{S.noLive}</p>
        )}
      </div>
      <aside className="absolute bottom-[2.5vw] right-[2.5vw] flex flex-col items-center gap-[0.6vw]">
        <Qr url={url} size={170} dark />
        <p data-testid="screen-qr-note" className="max-w-[14vw] break-words text-center text-[1.4vw] font-semibold leading-tight">{S.qr}</p>
      </aside>
    </ScreenFrame>
  );
}
