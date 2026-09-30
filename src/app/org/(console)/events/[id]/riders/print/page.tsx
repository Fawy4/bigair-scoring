import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { divisionScheme } from "@/lib/identification/division-scheme";
import { effectiveScheme, tableLabel } from "@/lib/identification/effective";
import { cleanIdentifiers } from "@/lib/riders/identifiers";
import { parseEventSettings } from "@/lib/schemas/event-settings";
import { defaultScheme } from "@/lib/schemas/identification";
import { getOrgContext } from "@/lib/org/context";
import { copy } from "@/lib/ui-copy";

export const metadata = { title: copy.riders.printStartList };
export const dynamic = "force-dynamic";

/** The start list of one division on one printable page: seed, Rider label, name, nationality and sponsor of everybody taking part. */
export default async function StartListPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ division?: string }> }) {
  const { id } = await params;
  const { division } = await searchParams;
  const { supabase, current } = await getOrgContext();
  const { data: event } = await supabase.from("events").select("id, name, settings, timezone").eq("id", id).maybeSingle();
  if (!event) notFound();
  const { data: div } = await supabase.from("divisions").select("id, name, identification").eq("id", division ?? "").eq("event_id", id).maybeSingle();
  if (!div) notFound();
  const { data: entries } = await supabase
    .from("entries")
    .select("id, seed, status, identifiers, created_at, riders(first_name, last_name, nationality, sponsor)")
    .eq("division_id", div.id)
    .eq("status", "confirmed");

  const settings = parseEventSettings(event.settings);
  const ev = settings.identification ? { scheme: settings.identification.scheme, allowDivisionOverride: settings.identification.allowDivisionOverride } : { scheme: defaultScheme(), allowDivisionOverride: false };
  const own = divisionScheme(div.identification);
  const scheme = effectiveScheme(ev, own ? { scheme: own } : null);
  const rows = (entries ?? [])
    .sort((a, b) => (a.seed ?? Infinity) - (b.seed ?? Infinity) || a.created_at.localeCompare(b.created_at))
    .map((e) => {
      const name = `${e.riders?.first_name ?? ""} ${e.riders?.last_name ?? ""}`.trim();
      const model = tableLabel(scheme, { name, nationality: e.riders?.nationality, sponsor: e.riders?.sponsor, identifiers: cleanIdentifiers(e.identifiers) });
      return { id: e.id, seed: e.seed, name, nationality: e.riders?.nationality ?? "", sponsor: e.riders?.sponsor ?? "", label: [model.primary.text, ...model.secondary.filter((s) => s.key !== "name" && s.key !== "nationality" && s.key !== "sponsor").map((s) => s.text)].join(" · ") };
    });
  const printed = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: event.timezone }).format(new Date());
  const C = copy.riders.printColumns;
  const cell = "border-2 border-[#111] p-2 text-left text-lg";

  return (
    <main className="print-page flex max-w-4xl flex-col gap-4">
      <div className="no-print flex flex-wrap gap-3">
        <PrintButton label={copy.riders.printButton} />
        <Link href={`/org/events/${id}/riders?division=${div.id}`} className="btn">
          {copy.riders.printBack}
        </Link>
      </div>
      <header>
        <h1 className="text-3xl font-extrabold">{copy.riders.printTitle(div.name)}</h1>
        <p className="text-lg font-semibold">
          {event.name}
          {current ? ` · ${current.name}` : ""} · {copy.riders.printDate(printed)}
        </p>
      </header>
      {rows.length === 0 ? (
        <p className="panel text-lg font-semibold">{copy.riders.printNone}</p>
      ) : (
        <table className="w-full border-collapse" data-testid="start-list">
          <thead>
            <tr>
              {[C.seed, C.rider, C.label, C.nationality, C.sponsor].map((h) => (
                <th key={h} className={`${cell} bg-[#eee]`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={`${cell} font-extrabold`}>{r.seed ?? "—"}</td>
                <td className={`${cell} font-bold`}>{r.name}</td>
                <td className={cell}>{r.label}</td>
                <td className={cell}>{r.nationality}</td>
                <td className={cell}>{r.sponsor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
