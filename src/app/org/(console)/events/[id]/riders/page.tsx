import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/lib/org/context";
import { effectiveScheme } from "@/lib/identification/effective";
import { parseEventSettings } from "@/lib/schemas/event-settings";
import { defaultScheme } from "@/lib/schemas/identification";
import { divisionScheme } from "@/lib/identification/division-scheme";
import { cleanIdentifiers } from "@/lib/riders/identifiers";
import { copy } from "@/lib/ui-copy";
import { RidersManager } from "./riders-manager";
import type { EntryRow, EntryStatus, OrgRider } from "./types";

export const metadata = { title: copy.wizard.steps.riders };
export const dynamic = "force-dynamic";

export default async function RidersStepPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ division?: string }> }) {
  const { id } = await params;
  const { division } = await searchParams;
  const { supabase } = await getDb();
  // one round: the event with the organisation's riders, the divisions, and the confirmed or not riders of every division (the chosen division is picked out below)
  const [{ data: event }, { data: divisions }, { data: allEntryRows }] = await Promise.all([
    supabase
      .from("events")
      .select("id, organisation_id, name, settings, organisations(riders(id, first_name, last_name, email, nationality))")
      .eq("id", id)
      .order("last_name", { referencedTable: "organisations.riders" })
      .order("first_name", { referencedTable: "organisations.riders" })
      .maybeSingle(),
    supabase.from("divisions").select("id, name, sort_order, identification, draw_locked_at, seed_shuffle_seed").eq("event_id", id).order("sort_order").order("created_at"),
    supabase
      .from("entries")
      .select("id, division_id, rider_id, seed, status, source, identifiers, decline_reason, created_at, riders(first_name, last_name, nationality, email, phone, sponsor, photo_url)")
      .eq("event_id", id),
  ]);
  if (!event) notFound();

  if (!divisions?.length) {
    return (
      <main className="flex flex-col gap-4">
        <h1>{copy.riders.stepHeading}</h1>
        <p className="panel text-lg font-semibold">{copy.riders.noDivisions}</p>
        <Link href={`/org/events/${id}/divisions`} className="btn btn-primary w-fit">
          {copy.wizard.steps.divisions}
        </Link>
      </main>
    );
  }
  const current = divisions.find((d) => d.id === division) ?? divisions[0];
  const entryRows = (allEntryRows ?? []).filter((e) => e.division_id === current.id);
  const riderRows = event.organisations?.riders ?? [];

  // stored photos sit in a private folder: each gets a link that works for an hour
  const stored = (entryRows ?? []).map((e) => e.riders?.photo_url).filter((p): p is string => Boolean(p) && !/^https?:\/\//i.test(p!));
  const signed = new Map<string, string>();
  if (stored.length) {
    const { data } = await supabase.storage.from("rider-photos").createSignedUrls(stored, 3600);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }

  const entries: EntryRow[] = (entryRows ?? []).map((e) => ({
    id: e.id,
    riderId: e.rider_id,
    seed: e.seed,
    status: e.status as EntryStatus,
    source: e.source,
    identifiers: cleanIdentifiers(e.identifiers),
    declineReason: e.decline_reason,
    createdAt: e.created_at,
    first: e.riders?.first_name ?? "",
    last: e.riders?.last_name ?? "",
    nationality: e.riders?.nationality ?? null,
    email: e.riders?.email ?? null,
    phone: e.riders?.phone ?? null,
    sponsor: e.riders?.sponsor ?? null,
    photoUrl: e.riders?.photo_url ?? null,
    photoLink: e.riders?.photo_url ? (/^https?:\/\//i.test(e.riders.photo_url) ? e.riders.photo_url : (signed.get(e.riders.photo_url) ?? null)) : null,
  }));
  const orgRiders: OrgRider[] = (riderRows ?? []).map((r) => ({ id: r.id, first: r.first_name, last: r.last_name, email: r.email, nationality: r.nationality }));

  const settings = parseEventSettings(event.settings);
  const eventIdentification = settings.identification
    ? { scheme: settings.identification.scheme, allowDivisionOverride: settings.identification.allowDivisionOverride }
    : { scheme: defaultScheme(), allowDivisionOverride: false };
  const own = divisionScheme(current.identification);
  const scheme = effectiveScheme(eventIdentification, own ? { scheme: own } : null);
  const schemeIsOwn = Boolean(own) && eventIdentification.allowDivisionOverride;

  return (
    <main className="flex flex-col gap-6">
      <h1>{copy.riders.stepHeading}</h1>
      <p className="max-w-[70ch] text-body font-medium text-beach-muted">{copy.riders.intro}</p>
      <RidersManager
        eventId={id}
        divisions={divisions.map((d) => ({ id: d.id, name: d.name, hasOwnScheme: Boolean(divisionScheme(d.identification)), drawLocked: Boolean(d.draw_locked_at), shuffleSeed: d.seed_shuffle_seed }))}
        selectedId={current.id}
        scheme={scheme}
        schemeIsOwn={schemeIsOwn}
        entries={entries}
        orgRiders={orgRiders}
      />
    </main>
  );
}
