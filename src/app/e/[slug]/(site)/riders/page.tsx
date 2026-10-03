import Link from "next/link";
import { notFound } from "next/navigation";
import { publicMetadata } from "@/lib/public/meta";
import { eventOg } from "@/lib/public/og";
import { loadCore } from "@/lib/public/page-data";
import { entryName } from "@/lib/public/schemes";
import { guardTab } from "@/lib/public/tab-guard";
import { requestOrigin } from "@/lib/platform/origin";
import { copy } from "@/lib/ui-copy";

export const dynamic = "force-dynamic";

const P = copy.pub.riders;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const core = await loadCore((await params).slug);
  if (!core) return { title: copy.pub.common.notFound };
  const og = eventOg(core.site, core.tt, core.tabs);
  return publicMetadata(await requestOrigin(), core.site, "/riders", { ...og, title: `${P.title} · ${core.site.event.name}` }, `${P.title} · ${core.site.event.name}`);
}

/**
 * The start list: every rider on the public list, by division, each name opening that rider's page (their heats, their released results, a card to share). Nothing
 * here that is not public already: the list is what the public functions give a visitor (divisions whose draw is locked; a simulation event only to its organiser).
 */
export default async function RidersListPage({ params }: { params: Promise<{ slug: string }> }) {
  const core = await loadCore((await params).slug);
  if (!core) notFound();
  guardTab(core.site, "riders");
  const { site, results } = core;
  const entries = results?.entries ?? [];
  const divisions = [...(results?.divisions ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const groups = divisions
    .map((d) => ({ division: d, riders: entries.filter((e) => e.division_id === d.id).sort((a, b) => entryName(a).localeCompare(entryName(b))) }))
    .filter((g) => g.riders.length > 0);
  if (!groups.length) return <p data-testid="riders-none" className="text-body font-medium">{P.none}</p>;
  return (
    <>
      <p className="text-body font-medium text-beach-muted">{P.intro}</p>
      {groups.map((g) => (
        <section key={g.division.id} data-testid="riders-division" aria-label={g.division.name} className="flex flex-col gap-1.5">
          <h2 className="text-heading font-semibold text-beach-muted">
            {g.division.name} <span className="text-small font-medium">{P.count(g.riders.length)}</span>
          </h2>
          <ul data-testid="riders-list" className="flex flex-col divide-y divide-beach-line rounded-card border border-beach-line bg-beach-surface">
            {g.riders.map((e) => (
              <li key={e.id}>
                <Link prefetch={false} data-testid="rider-link" data-entry={e.id} href={`/e/${site.event.slug}/riders/${e.id}`} className="flex min-h-tap items-center px-3 text-name font-semibold underline-offset-2 hover:underline">
                  {entryName(e)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
