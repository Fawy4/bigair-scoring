import Link from "next/link";
import { notFound } from "next/navigation";
import { ChipLinks } from "@/components/public/chips";
import { highestJumpLine, buildPlacings } from "@/lib/public/ladder-model";
import { loadDraw } from "@/lib/public/load";
import { publicMetadata } from "@/lib/public/meta";
import { eventOg } from "@/lib/public/og";
import { loadCore } from "@/lib/public/page-data";
import { requestOrigin } from "@/lib/platform/origin";
import { copy } from "@/lib/ui-copy";

export const dynamic = "force-dynamic";

const P = copy.pub.placings;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const core = await loadCore((await params).slug);
  if (!core) return { title: copy.pub.common.notFound };
  const og = eventOg(core.site, core.tt, core.tabs);
  return publicMetadata(await requestOrigin(), core.site, "/placings", { ...og, title: `${P.title} · ${core.site.event.name}` }, `${P.title} · ${core.site.event.name}`);
}

/** Final places per division as far as they are decided (riders knocked out in the same round share a place, "13="), and the highest jump of the division when any attempt has a height. */
export default async function PlacingsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ division?: string }> }) {
  const core = await loadCore((await params).slug);
  if (!core) notFound();
  const { site, results } = core;
  const drawPayload = await loadDraw(site.event.id);
  const divisions = drawPayload?.divisions ?? [];
  if (!divisions.length) return <p className="text-body font-medium">{P.none}</p>;
  const wanted = (await searchParams).division;
  const current = divisions.find((d) => d.id === wanted) ?? divisions[0];
  const entries = results?.entries ?? [];
  const placings = buildPlacings(current.draw, entries);
  const jump = highestJumpLine(results?.divisions.find((d) => d.id === current.id), entries);
  const base = `/e/${site.event.slug}/placings`;
  return (
    <>
      {divisions.length > 1 ? <ChipLinks testId="division-tabs" label={copy.pub.results.divisionTabs} items={divisions.map((d) => ({ href: `${base}?division=${d.id}`, label: d.name, current: d.id === current.id }))} /> : null}
      <h2 className="text-heading font-semibold">{current.name}</h2>
      {jump ? (
        <p data-testid="highest-jump" className="rounded-card border border-beach-line bg-beach-surface px-3 py-2 text-name font-semibold">
          {jump}
        </p>
      ) : null}
      {placings.length ? (
        <>
          <ol data-testid="placings" className="flex flex-col divide-y divide-beach-line rounded-card border border-beach-line bg-beach-surface">
            {placings.map((p) => (
              <li key={p.entryId} data-testid="placing-row" data-place={p.label} className="flex items-center gap-3 px-3 py-1.5">
                <span className="w-9 shrink-0 text-name font-semibold tabular-nums">{p.label}</span>
                <Link prefetch={false} href={`/e/${site.event.slug}/riders/${p.entryId}`} className="min-w-0 truncate text-name font-semibold underline-offset-2 hover:underline">{p.name}</Link>
              </li>
            ))}
          </ol>
          <p className="text-small font-medium text-beach-muted">{P.shared}</p>
        </>
      ) : (
        <p data-testid="no-placings" className="text-body font-medium">
          {P.none}
        </p>
      )}
    </>
  );
}
