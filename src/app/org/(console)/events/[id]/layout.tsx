import { notFound } from "next/navigation";
import type { RailStep } from "@/components/org/step-rail";
import { eventDatesInWords } from "@/lib/org/event-dates";
import { getOrgContext } from "@/lib/org/context";
import { loadSetupCounts } from "@/lib/org/setup-counts";
import { requestOrigin } from "@/lib/platform/origin";
import { wizardSteps } from "@/lib/wizard/status";
import { OrgChrome } from "../../org-chrome";

/** Event shell: top bar with the event, left rail of seven steps (a step picker on a phone), Previous / Next at the foot. Each step saves on its own. */
export default async function EventWizardLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getOrgContext();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: event } = await supabase.from("events").select("id, name, slug, status, location, start_date, end_date, timezone").eq("id", id).maybeSingle();
  if (!event) notFound();
  const { data: divisions } = await supabase.from("divisions").select("id, name, scoring_model_id, format_template_id").eq("event_id", id).order("sort_order");
  const counts = await loadSetupCounts(supabase, id, event.timezone || "Africa/Cairo");
  const info = wizardSteps(event, divisions ?? [], counts);
  const steps: RailStep[] = info.map((s) => ({ key: s.key, label: s.label, state: s.state, reason: s.reason, href: s.key === "golive" ? `/org/events/${id}` : `/org/events/${id}/${s.key}` }));
  const origin = await requestOrigin();
  const status = event.status === "live" ? "live" : event.status === "published" ? "published" : "draft";

  return (
    <OrgChrome event={{ name: event.name, href: `/org/events/${id}`, dates: eventDatesInWords(event.start_date, event.end_date), status, publicUrl: `${origin}/e/${event.slug}` }} steps={steps}>
      {children}
    </OrgChrome>
  );
}
