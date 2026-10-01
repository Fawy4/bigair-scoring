import { getOrgContext } from "@/lib/org/context";
import { loadIdentificationSchemes } from "@/lib/org/presets";
import { knownTimeZones } from "@/lib/schemas/org-settings";
import { copy } from "@/lib/ui-copy";
import { blankEventValues } from "@/lib/schemas/event-values";
import { EventForm } from "@/app/org/(console)/events/event-form";

export const metadata = { title: copy.orgHome.newEvent };

export default async function NewEventPage() {
  const { supabase, current } = await getOrgContext();
  if (!current) return <p className="panel text-lg font-semibold">{copy.orgHome.noOrg}</p>;
  const schemes = await loadIdentificationSchemes(supabase, current.id);
  return (
    <main className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-3xl font-extrabold">{copy.event.newHeading(current.name)}</h1>
      <p className="font-semibold">{copy.event.newIntro}</p>
      <EventForm
        initial={{ id: null, organisationId: current.id, status: "draft", values: blankEventValues(current.settings.defaultTimezone), savedSlug: null }}
        timeZones={knownTimeZones()}
        schemes={schemes}
      />
    </main>
  );
}
