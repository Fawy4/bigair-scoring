import { notFound } from "next/navigation";
import { ChipLinks } from "@/components/public/chips";
import { ridersForView } from "@/lib/public/heat-view";
import { HeatSummary } from "@/components/public/heat-summary";
import { publicMetadata } from "@/lib/public/meta";
import { heatOg } from "@/lib/public/og";
import { guardTab } from "@/lib/public/tab-guard";
import { loadCore } from "@/lib/public/page-data";
import { defaultHeatId } from "@/lib/public/results-model";
import { requestOrigin } from "@/lib/platform/origin";
import { copy } from "@/lib/ui-copy";

export const dynamic = "force-dynamic";

const R = copy.pub.results;

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ heat?: string }> }) {
  const core = await loadCore((await params).slug);
  if (!core) return { title: copy.pub.common.notFound };
  const wanted = (await searchParams).heat;
  const tab = core.tabs.find((t) => t.id === (wanted ?? defaultHeatId(core.tabs, core.tt.now?.heatId ?? null)));
  const title = `${R.title} · ${core.site.event.name}`;
  if (!tab) return { title };
  return publicMetadata(await requestOrigin(), core.site, `/results?heat=${tab.id}`, heatOg(core.site, tab), title);
}

/** Results per heat, in tabs: the leaderboard opens on the live heat, otherwise the last released one. One compact row per rider, the attempts as coloured boxes. */
export default async function ResultsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ heat?: string; division?: string }> }) {
  const core = await loadCore((await params).slug);
  if (!core) notFound();
  guardTab(core.site, "results");
  const { site, tabs, tt } = core;
  const sp = await searchParams;
  const base = `/e/${site.event.slug}/results`;
  if (!tabs.length) {
    return (
      <p data-testid="no-results" className="text-body font-medium">
        {R.noResults}
      </p>
    );
  }
  const heatId = (sp.heat && tabs.some((t) => t.id === sp.heat) ? sp.heat : null) ?? (sp.division ? tabs.find((t) => t.divisionId === sp.division)?.id : null) ?? defaultHeatId(tabs, tt.now?.heatId ?? null);
  const heat = tabs.find((t) => t.id === heatId)!;
  const divisions = [...new Map(tabs.map((t) => [t.divisionId, t.divisionName])).entries()];
  const inDivision = tabs.filter((t) => t.divisionId === heat.divisionId);
  const view = await ridersForView(core, heat);
  const stateWord = heat.state === "complete" ? R.complete : heat.state === "live" ? R.live : heat.state === "held" ? R.held : R.notStarted;

  return (
    <>
      {divisions.length > 1 ? <ChipLinks testId="division-tabs" label={R.divisionTabs} items={divisions.map(([id, name]) => ({ href: `${base}?division=${id}`, label: name, current: id === heat.divisionId }))} /> : null}
      <ChipLinks testId="heat-tabs" label={R.tabs} items={inDivision.map((t) => ({ href: `${base}?heat=${t.id}`, label: t.tab, current: t.id === heat.id, testId: "heat-tab" }))} />
      <h2 data-testid="results-title" className="flex flex-wrap items-center gap-2 text-heading font-semibold">
        {heat.title}
        <span className="rounded-full border border-beach-line px-2 text-small font-semibold">{stateWord}</span>
      </h2>
      {heat.state === "live" && !view.live ? <p data-testid="scores-after" className="rounded-card border border-beach-line bg-beach-surface px-3 py-2 text-name font-semibold">{R.scoresAfter}</p> : null}
      <HeatSummary heat={view.live ? { ...heat, state: "live" } : heat} riders={view.riders} riderHref={(id) => `/e/${site.event.slug}/riders/${id}`} />
      <p className="text-small font-medium text-beach-muted">{R.defaultNote}</p>
    </>
  );
}
