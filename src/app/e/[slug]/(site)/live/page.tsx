import { notFound } from "next/navigation";
import { ChipLinks } from "@/components/public/chips";
import { HeatClock } from "@/components/public/heat-clock";
import { HeatSummary } from "@/components/public/heat-summary";
import { publicMetadata } from "@/lib/public/meta";
import { heatOg } from "@/lib/public/og";
import { ridersForView } from "@/lib/public/heat-view";
import { loadCore } from "@/lib/public/page-data";
import { requestOrigin } from "@/lib/platform/origin";
import { copy } from "@/lib/ui-copy";

export const dynamic = "force-dynamic";

const T = copy.pub.live;

function pickHeat(core: NonNullable<Awaited<ReturnType<typeof loadCore>>>, wanted: string | undefined): string | null {
  if (wanted && core.tabs.some((t) => t.id === wanted)) return wanted;
  return core.tt.now?.heatId ?? core.tt.upNext[0]?.heatId ?? core.tabs.find((t) => t.state === "live")?.id ?? core.tabs.filter((t) => t.state === "complete").at(-1)?.id ?? core.tabs[0]?.id ?? null;
}

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ heat?: string }> }) {
  const core = await loadCore((await params).slug);
  if (!core) return { title: copy.pub.common.notFound };
  const id = pickHeat(core, (await searchParams).heat);
  const tab = core.tabs.find((t) => t.id === id);
  if (!tab) return { title: `${T.title} · ${core.site.event.name}` };
  return publicMetadata(await requestOrigin(), core.site, `/live?heat=${tab.id}`, heatOg(core.site, tab), `${T.title} · ${core.site.event.name}`);
}

/** The heat on the water (or the next one): its clock, the riders as Rider labels, and running totals only when the division allows live scores. */
export default async function LivePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ heat?: string }> }) {
  const core = await loadCore((await params).slug);
  if (!core) notFound();
  const { site, tabs, timetable } = core;
  const base = `/e/${site.event.slug}`;
  const heatId = pickHeat(core, (await searchParams).heat);
  const tab = tabs.find((t) => t.id === heatId);
  if (!tab || !heatId) {
    return (
      <p data-testid="no-heat" className="text-body font-medium">
        {T.noHeat}
      </p>
    );
  }
  const heat = timetable?.heats.find((h) => h.id === heatId);
  const { riders, live: liveOn } = await ridersForView(core, tab);
  const state = heat?.effective_status ?? heat?.status ?? tab.state;
  const stateWord = tab.state === "complete" ? copy.pub.results.complete : state === "running" ? T.running : state === "paused" ? T.paused : state === "ended" || state === "under_review" ? T.ended : T.scheduled;
  const others = tabs.filter((t) => t.state !== "complete").slice(0, 8);

  return (
    <>
      <h2 data-testid="live-title" className="text-heading font-semibold">
        {tab.title}
      </h2>
      <p className="flex flex-wrap items-center gap-2 text-name font-semibold">
        <span data-testid="live-state" className="rounded-full border border-beach-line px-2 text-small font-semibold">
          {stateWord}
        </span>
        {heat && (state === "running" || state === "paused") ? <HeatClock startedAt={heat.started_at} durationSec={heat.duration_sec} pausedAt={heat.paused_at} pausedTotalSec={heat.paused_total_sec} status={state} serverNow={timetable!.server_now} className="tabular-nums" /> : null}
      </p>
      {others.length > 1 ? <ChipLinks label={T.heatPicker} items={others.map((t) => ({ href: `${base}/live?heat=${t.id}`, label: `${t.divisionName} · ${t.tab}`, current: t.id === heatId }))} /> : null}
      {tab.state !== "complete" && !liveOn ? (
        <p data-testid="scores-after" className="rounded-card border border-beach-line bg-beach-surface px-3 py-2 text-name font-semibold">
          {T.scoresAfter}
        </p>
      ) : null}
      {liveOn ? <p className="text-small font-medium text-beach-muted">{T.liveScores}</p> : null}
      <HeatSummary heat={{ ...tab, state: tab.state === "complete" ? "complete" : liveOn ? "live" : tab.state }} riders={riders} riderHref={(id) => `${base}/riders/${id}`} />
    </>
  );
}
