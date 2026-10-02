import Link from "next/link";
import { SlugLink } from "@/components/slug-link";
import { getOrgContext } from "@/lib/org/context";
import { copy } from "@/lib/ui-copy";

export const metadata = { title: copy.layout.events };

export default async function OrganiserHome({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const showArchived = (await searchParams).archived === "1";
  const { supabase, current } = await getOrgContext();
  if (!current) {
    return <p className="panel text-lg font-semibold">{copy.orgHome.noOrg}</p>;
  }
  const { data: events } = await supabase
    .from("events")
    .select("id, name, slug, status, start_date, archived_at")
    .eq("organisation_id", current.id)
    .order("start_date", { ascending: false, nullsFirst: true });

  const all = events ?? [];
  const archivedCount = all.filter((e) => e.archived_at).length;
  const visibleEvents = showArchived ? all : all.filter((e) => !e.archived_at);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>{copy.orgHome.heading(current.name)}</h1>
        <Link href="/org/events/new" className="btn btn-primary">
          {copy.orgHome.newEvent}
        </Link>
      </div>
      <ul className="flex flex-col gap-2">
        {visibleEvents.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-beach-line p-3">
            <div>
              <p className="text-[16px] font-semibold">{e.name}</p>
              <p className="flex flex-wrap items-center gap-x-2 text-body font-medium text-beach-muted">
                <span>{copy.orgHome.line(e.start_date ?? copy.orgHome.noDate, e.status)}</span>
                <SlugLink slug={e.slug} />
                {e.archived_at ? <span>· {copy.eventLifecycle.archivedTag}</span> : null}
              </p>
            </div>
            <Link href={`/org/events/${e.id}/event`} className="btn">
              {copy.orgHome.openSetup}
            </Link>
          </li>
        ))}
        {visibleEvents.length === 0 ? <li className="rounded-card border border-dashed border-beach-border bg-beach-surface p-4 text-body font-semibold">{copy.orgHome.empty}</li> : null}
      </ul>
      {archivedCount > 0 ? (
        <Link href={showArchived ? "/org" : "/org?archived=1"} className="btn w-fit">
          {showArchived ? copy.eventLifecycle.hideArchived : copy.eventLifecycle.showArchived(archivedCount)}
        </Link>
      ) : null}
    </main>
  );
}
