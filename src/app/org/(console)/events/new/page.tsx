import { getOrgContext } from "@/lib/org/context";
import { loadIdentificationSchemes } from "@/lib/org/presets";
import { knownTimeZones } from "@/lib/schemas/org-settings";
import { blankEventValues } from "@/lib/schemas/event-values";
import { EventForm } from "../event-form";

export const metadata = { title: "New event" };

export default async function NewEventPage() {
  const { supabase, current } = await getOrgContext();
  if (!current) return <p className="panel text-lg font-semibold">You are not a member of any organisation yet.</p>;
  const schemes = await loadIdentificationSchemes(supabase, current.id);
  return (
    <main className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-3xl font-extrabold">New event for {current.name}</h1>
      <p className="font-semibold">Step 1 of the setup: the basics. You can add divisions, riders and officials after saving.</p>
      <EventForm
        initial={{ id: null, organisationId: current.id, status: "draft", values: blankEventValues(current.settings.defaultTimezone), savedSlug: null }}
        timeZones={knownTimeZones()}
        schemes={schemes}
      />
    </main>
  );
}
