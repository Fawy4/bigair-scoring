import { notFound } from "next/navigation";
import { ChipLinks } from "@/components/public/chips";
import { LadderView } from "@/components/public/ladder-view";
import { loadDraw } from "@/lib/public/load";
import { buildLadder } from "@/lib/public/ladder-model";
import { publicMetadata } from "@/lib/public/meta";
import { eventOg } from "@/lib/public/og";
import { guardTab } from "@/lib/public/tab-guard";
import { loadCore } from "@/lib/public/page-data";
import { modelOf } from "@/lib/public/results-model";
import { schemeFor } from "@/lib/public/schemes";
import { requestOrigin } from "@/lib/platform/origin";
import { copy } from "@/lib/ui-copy";

export const dynamic = "force-dynamic";

const L = copy.pub.ladder;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const core = await loadCore((await params).slug);
  if (!core) return { title: copy.pub.common.notFound };
  const og = eventOg(core.site, core.tt, core.tabs);
  return publicMetadata(await requestOrigin(), core.site, "/ladder", { ...og, title: `${L.title} · ${core.site.event.name}` }, `${L.title} · ${core.site.event.name}`);
}

/** The ladder of one division: heats as boxes, riders in their Lycra colour with their totals, placeholders for seats that wait ("1st H1"), the winner in the next seat. */
export default async function LadderPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ division?: string }> }) {
  const core = await loadCore((await params).slug);
  if (!core) notFound();
  guardTab(core.site, "ladder");
  const { site, results, rules } = core;
  const drawPayload = await loadDraw(site.event.id);
  const drawn = (drawPayload?.divisions ?? []).filter((d) => d.draw);
  if (!drawn.length) {
    return (
      <p data-testid="no-ladder" className="text-body font-medium">
        {L.noLadder}
      </p>
    );
  }
  const wanted = (await searchParams).division;
  const current = drawn.find((d) => d.id === wanted) ?? drawn[0];
  const base = `/e/${site.event.slug}`;
  const rounds = buildLadder(current.draw, results?.divisions.find((d) => d.id === current.id), schemeFor(site, current.id), modelOf(rules, current.id)?.panel.decimals ?? 2);
  return (
    <>
      {drawn.length > 1 ? <ChipLinks testId="division-tabs" label={copy.pub.results.divisionTabs} items={drawn.map((d) => ({ href: `${base}/ladder?division=${d.id}`, label: d.name, current: d.id === current.id }))} /> : null}
      <h2 className="text-heading font-semibold">{current.name}</h2>
      <LadderView rounds={rounds} heatHref={(id) => `${base}/results?heat=${id}`} />
    </>
  );
}
