import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/org/context";
import { loadIdentificationSchemes } from "@/lib/org/presets";
import { knownTimeZones } from "@/lib/schemas/org-settings";
import { copy } from "@/lib/ui-copy";
import { valuesFromRow } from "@/lib/schemas/event-values";
import { EventForm } from "../../event-form";

export const metadata = { title: copy.wizard.steps.event };

export default async function EventStepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getOrgContext();
  const { data: event } = await supabase
    .from("events")
    .select("id, organisation_id, name, slug, location, timezone, start_date, end_date, status, settings, branding")
    .eq("id", id)
    .maybeSingle();
  if (!event) notFound();
  const schemes = await loadIdentificationSchemes(supabase, event.organisation_id);
  return (
    <main className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-3xl font-extrabold">{copy.event.stepHeading}</h1>
      <EventForm
        key={event.id}
        initial={{ id: event.id, organisationId: event.organisation_id, status: event.status, values: valuesFromRow(event), savedSlug: event.slug }}
        timeZones={knownTimeZones()}
        schemes={schemes}
      />
    </main>
  );
}
