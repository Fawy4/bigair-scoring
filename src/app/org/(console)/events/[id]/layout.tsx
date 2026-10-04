import { notFound } from "next/navigation";
import type { RailStep } from "@/components/org/step-rail";
import { eventDatesInWords } from "@/lib/org/event-dates";
import { getDb } from "@/lib/org/context";
import { loadSetupRows, setupCountsFrom } from "@/lib/org/setup-counts";
import { requestOrigin } from "@/lib/platform/origin";
import { wizardSteps } from "@/lib/wizard/status";
import { OrgChrome } from "../../org-chrome";

/** Event shell: top bar with the event, left rail of seven steps (a step picker on a phone), Previous / Next at the foot. Each step saves on its own. */
export default async function EventWizardLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getDb();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  // the event, and everything the rail's pills are worked out from, asked for at the same time (the event is only needed afterwards for its time zone)
  const [{ data: event }, rows, origin] = await Promise.all([
    supabase.from("events").select("id, name, slug, status, location, start_date, end_date, timezone").eq("id", id).maybeSingle(),
    loadSetupRows(supabase, id),
    requestOrigin(),
  ]);
  if (!event) notFound();
  const counts = setupCountsFrom(rows, event.timezone || "Africa/Cairo");
  const divisions = rows.divisions;
  const info = wizardSteps(event, divisions, counts);
  const steps: RailStep[] = info.map((s) => ({ key: s.key, label: s.label, state: s.state, reason: s.reason, href: s.key === "golive" ? `/org/events/${id}` : `/org/events/${id}/${s.key}` }));
  const status = event.status === "live" ? "live" : event.status === "published" ? "published" : "draft";

  return (
    <OrgChrome event={{ name: event.name, href: `/org/events/${id}`, dates: eventDatesInWords(event.start_date, event.end_date), status, publicUrl: `${origin}/e/${event.slug}` }} steps={steps}>
      {children}
    </OrgChrome>
  );
}
