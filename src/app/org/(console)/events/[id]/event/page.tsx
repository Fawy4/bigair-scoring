import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/org/context";
import { loadIdentificationSchemes } from "@/lib/org/presets";
import { knownTimeZones } from "@/lib/schemas/org-settings";
import { copy } from "@/lib/ui-copy";
import { valuesFromRow } from "@/lib/schemas/event-values";
import { EventLifecycle } from "@/components/event-lifecycle";
import { EventForm } from "../../event-form";

export const metadata = { title: copy.wizard.steps.event };

export default async function EventStepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getOrgContext();
  const { data: event } = await supabase
    .from("events")
    .select("id, organisation_id, name, slug, location, timezone, start_date, end_date, status, settings, branding, archived_at, is_simulation")
    .eq("id", id)
    .maybeSingle();
  if (!event) notFound();
  const schemes = await loadIdentificationSchemes(supabase, event.organisation_id);
  // any published result (a result line, or a published heat) makes the event permanent: then only Archive is offered
  const [{ count: resultLines }, { count: publishedHeats }] = await Promise.all([
    supabase.from("heat_results").select("id", { count: "exact", head: true }).eq("event_id", event.id),
    supabase.from("heats").select("id", { count: "exact", head: true }).eq("event_id", event.id).eq("status", "published"),
  ]);
  return (
    <main className="flex min-w-0 flex-col gap-4">
      <h1 className="text-[20px] font-semibold leading-tight">{copy.event.stepHeading}</h1>
      <EventForm
        key={event.id}
        initial={{ id: event.id, organisationId: event.organisation_id, status: event.status, values: valuesFromRow(event), savedSlug: event.slug }}
        timeZones={knownTimeZones()}
        schemes={schemes}
      />
      <section className="org-new flex flex-col gap-3 rounded-card border border-beach-line p-4" aria-labelledby="lifecycle-h">
        <h2 id="lifecycle-h" className="text-[14px] font-semibold">
          {copy.eventLifecycle.heading}
        </h2>
        <EventLifecycle
          eventId={event.id}
          eventName={event.name}
          slug={event.slug}
          publishedResults={(resultLines ?? 0) + (publishedHeats ?? 0)}
          archived={Boolean(event.archived_at)}
          afterDelete="/org"
        />
      </section>
    </main>
  );
}
