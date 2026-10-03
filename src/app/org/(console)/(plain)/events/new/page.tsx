import { getOrgContext } from "@/lib/org/context";
import { loadIdentificationSchemes } from "@/lib/org/presets";
import { knownTimeZones } from "@/lib/schemas/org-settings";
import { copy } from "@/lib/ui-copy";
import { blankEventValues } from "@/lib/schemas/event-values";
import { EventForm } from "@/app/org/(console)/events/event-form";

export const metadata = { title: copy.orgHome.newEvent };

export default async function NewEventPage() {
  const { supabase, current } = await getOrgContext();
  if (!current) return <p className="rounded-card border border-beach-line p-4 text-body font-semibold">{copy.orgHome.noOrg}</p>;
  const schemes = await loadIdentificationSchemes(supabase, current.id);
  return (
    <main className="flex min-w-0 flex-col gap-4">
      <h1 className="text-[20px] font-semibold leading-tight">{copy.event.newHeading(current.name)}</h1>
      <p className="max-w-[70ch] text-body font-medium text-beach-muted">{copy.event.newIntro}</p>
      <EventForm
        initial={{ id: null, organisationId: current.id, status: "draft", values: blankEventValues(current.settings.defaultTimezone), savedSlug: null }}
        timeZones={knownTimeZones()}
        schemes={schemes}
      />
    </main>
  );
}
