import Link from "next/link";
import { ClockText } from "@/components/clock-text";
import { PublicDrift } from "@/components/drift-badge";
import { notFound } from "next/navigation";
import { CopyLink } from "@/components/public/copy-link";
import { HeatClock } from "@/components/public/heat-clock";
import { Qr } from "@/components/public/qr";
import { SponsorStrip } from "@/components/public/sponsor-strip";
import { PublicFlagStrip } from "@/components/public/public-flag";
import { publicFlagData } from "@/lib/public/flag-data";
import { StateBadge, TimetableList, timeText } from "@/components/public/timetable-list";
import { publicMetadata } from "@/lib/public/meta";
import { eventOg } from "@/lib/public/og";
import { guardTab } from "@/lib/public/tab-guard";
import { loadCore } from "@/lib/public/page-data";
import { eventUrl, whatsappLink } from "@/lib/public/share";
import { requestOrigin } from "@/lib/platform/origin";
import { formatEventDates } from "@/lib/platform/event-label";
import { copy } from "@/lib/ui-copy";

export const dynamic = "force-dynamic";

const H = copy.pub.home;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const core = await loadCore((await params).slug);
  if (!core) return { title: copy.pub.common.notFound };
  return publicMetadata(await requestOrigin(), core.site, "", eventOg(core.site, core.tt, core.tabs), core.site.event.name);
}

/** The event's home: what is on now, the next two heats with estimated times, today's timetable, the share buttons and QR, and the sponsors. */
export default async function PublicHome({ params }: { params: Promise<{ slug: string }> }) {
  const core = await loadCore((await params).slug);
  if (!core) notFound();
  guardTab(core.site, "home");
  const { site, tt, timetable } = core;
  const base = `/e/${site.event.slug}`;
  const origin = await requestOrigin();
  const url = eventUrl(origin, site.event.slug);
  const liveHeat = tt.now?.heatId ? timetable?.heats.find((h) => h.id === tt.now!.heatId) : undefined;
  const heatHref = (id: string) => `${base}/live?heat=${id}`;
  const flagData = publicFlagData(timetable, tt, site.settings.flags);
  const day = tt.day && !tt.isToday ? formatEventDates(tt.day, tt.day) : null;

  return (
    <>
      {flagData ? <PublicFlagStrip data={flagData} /> : null}
      {tt.onHold ? (
        <p data-testid="on-hold" role="status" className="rounded-card border-2 border-beach-outlier bg-beach-surface px-3 py-2 text-name font-semibold">
          {H.onHold}
        </p>
      ) : null}

      <section data-testid="now" aria-label={H.now} className="flex flex-col gap-1 rounded-card border border-beach-line bg-beach-surface p-2.5">
        <h2 className="text-heading font-semibold text-beach-muted">{H.now}</h2>
        {tt.now ? (
          <>
            <p data-testid="now-title" className="text-name font-semibold">
              {H.now}: {tt.now.title}
              {liveHeat ? (
                <>
                  {" · "}
                  <HeatClock leftWord={copy.pub.home.left} pausedWord={copy.pub.home.paused} startedAt={liveHeat.started_at} durationSec={liveHeat.duration_sec} pausedAt={liveHeat.paused_at} pausedTotalSec={liveHeat.paused_total_sec} status={liveHeat.effective_status === "paused" || liveHeat.paused_at ? "paused" : "running"} serverNow={timetable!.server_now} />
                </>
              ) : null}
            </p>
            <Link prefetch={false} href={heatHref(tt.now.heatId!)} className="inline-flex min-h-tap items-center self-start rounded-xl border border-beach-accent bg-beach-accent px-3 text-body font-semibold text-beach-on-accent">
              {H.openLive}
            </Link>
          </>
        ) : (
          <p className="text-body font-medium">{H.nothingNow}</p>
        )}
      </section>

      <section data-testid="up-next" aria-label={H.upNext} className="flex flex-col gap-1.5">
        <h2 className="text-heading font-semibold text-beach-muted">{H.upNext}</h2>
        {tt.upNext.length ? (
          <ol className="flex flex-col divide-y divide-beach-line rounded-card border border-beach-line bg-beach-surface">
            {tt.upNext.map((r) => (
              <li key={r.itemId} data-testid="up-next-row" className="flex items-center justify-between gap-2 px-2 py-1.5">
                <span className="min-w-0 text-body font-semibold">{r.title}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-name font-semibold tabular-nums">{timeText(r)}</span>
                  <StateBadge status={r.status} walkover={r.walkover} />
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-body font-medium">{H.nothingNext}</p>
        )}
      </section>

      <section data-testid="timetable-section" aria-label={H.timetable} className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-heading font-semibold text-beach-muted">{day ? H.timetableFor(day) : H.timetable}</h2>
          <ClockText timezone={site.event.timezone} serverNow={core.now} />
        </div>
        {tt.rows.length ? (
          <>
            <PublicDrift drift={tt.drift ?? null} />
            <TimetableList rows={tt.rows} heatHref={heatHref} />
            <p data-testid="estimates-note" className="text-small font-medium text-beach-muted">
              {H.estimates}
              {tt.finish ? ` · ${copy.runOrder.finish(tt.finish)}` : ""}
            </p>
          </>
        ) : (
          <p className="text-body font-medium">{H.noTimetable}</p>
        )}
      </section>

      <section data-testid="share" aria-label={copy.pub.share.heading} className="flex flex-col gap-2 rounded-card border border-beach-line bg-beach-surface p-2.5">
        <h2 className="text-heading font-semibold text-beach-muted">{copy.pub.share.heading}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <a data-testid="share-whatsapp" href={whatsappLink(copy.pub.share.text(site.event.name), url)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-tap items-center rounded-xl border border-beach-accent bg-beach-accent px-3 text-body font-semibold text-beach-on-accent">
            {copy.pub.share.whatsapp}
          </a>
          <CopyLink url={url} label={copy.pub.share.copy} doneLabel={copy.pub.share.copied} />
        </div>
        <div className="flex items-center gap-3">
          <Qr url={url} size={120} />
          <p className="text-small font-medium text-beach-muted">{copy.pub.share.qr}</p>
        </div>
      </section>

      <SponsorStrip sponsors={site.branding.sponsors} />
      <p className="text-center text-small font-medium text-beach-muted">
        <Link prefetch={false} href={`${base}/register`} className="underline">
          {copy.registration.join.link}
        </Link>
      </p>
    </>
  );
}
