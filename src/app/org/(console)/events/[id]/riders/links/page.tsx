import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { Qr } from "@/components/public/qr";
import { getOrgContext } from "@/lib/org/context";
import { requestOrigin } from "@/lib/platform/origin";
import { eventUrl } from "@/lib/public/share";
import { copy } from "@/lib/ui-copy";
import { LinksText } from "./links-text";

export const metadata = { title: copy.riders.links.title };
export const dynamic = "force-dynamic";

const T = copy.riders.links;

/**
 * Rider links: one printable card per confirmed rider (a QR code and the address of the rider's own page, no login needed) and the same list as "Name — address"
 * lines to paste into a WhatsApp group. The pages themselves follow the public rules: a rider's page opens once the division's draw is locked and the event is public;
 * a rehearsal (simulation) event is not public, so its links open only for you.
 */
export default async function RiderLinksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getOrgContext();
  const { data: event } = await supabase.from("events").select("id, name, slug, is_simulation").eq("id", id).maybeSingle();
  if (!event) notFound();
  const [{ data: divisions }, { data: entries }] = await Promise.all([
    supabase.from("divisions").select("id, name, sort_order, draw_locked_at").eq("event_id", id).order("sort_order").order("created_at"),
    supabase.from("entries").select("id, division_id, seed, created_at, riders(first_name, last_name)").eq("event_id", id).eq("status", "confirmed"),
  ]);
  const origin = await requestOrigin();
  const name = (e: NonNullable<typeof entries>[number]) => `${e.riders?.first_name ?? ""} ${e.riders?.last_name ?? ""}`.trim() || "Rider";
  const groups = (divisions ?? [])
    .map((d) => ({
      division: d,
      riders: (entries ?? [])
        .filter((e) => e.division_id === d.id)
        .sort((a, b) => name(a).localeCompare(name(b)))
        .map((e) => ({ id: e.id, name: name(e), url: eventUrl(origin, event.slug, `/riders/${e.id}`) })),
    }))
    .filter((g) => g.riders.length > 0);
  const text = groups.flatMap((g) => g.riders.map((r) => `${r.name} — ${r.url}`)).join("\n");
  const notLocked = groups.filter((g) => !g.division.draw_locked_at).reduce((n, g) => n + g.riders.length, 0);
  return (
    <main className="print-page flex flex-col gap-4">
      <div className="no-print flex flex-col gap-3">
        <h1>{T.title}</h1>
        <p className="max-w-[70ch] text-body font-medium text-beach-muted">{T.intro}</p>
        {event.is_simulation ? <p data-testid="rider-links-simulation" className="panel max-w-[70ch] font-semibold">{T.simulationNote}</p> : null}
        {notLocked > 0 ? <p data-testid="rider-links-notlocked" className="panel max-w-[70ch] font-semibold">{T.notLockedNote(notLocked)}</p> : null}
        <div className="flex flex-wrap gap-3">
          <PrintButton label={T.print} />
          <Link href={`/org/events/${id}/riders`} className="btn">
            {copy.riders.printBack}
          </Link>
        </div>
      </div>
      <header className="hidden print:block">
        <h1 className="text-3xl font-extrabold">{T.printTitle(event.name)}</h1>
      </header>
      {groups.length === 0 ? (
        <p className="panel text-lg font-semibold">{T.none}</p>
      ) : (
        groups.map((g) => (
          <section key={g.division.id} className="flex flex-col gap-2" aria-label={g.division.name}>
            <h2 className="text-xl font-bold">{g.division.name}</h2>
            <ul data-testid="rider-links" className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
              {g.riders.map((r) => (
                <li key={r.id} data-testid="rider-link-card" data-entry={r.id} className="flex break-inside-avoid items-center gap-3 rounded-card border-2 border-[#111] bg-white p-2 text-[#111]">
                  <Qr url={r.url} size={104} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-lg font-extrabold leading-tight">{r.name}</span>
                    <span data-testid="rider-link-url" className="break-all text-xs font-semibold">{r.url}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {text ? <LinksText text={text} /> : null}
    </main>
  );
}
