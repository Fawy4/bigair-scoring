import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/org/context";
import { loadSetupCounts } from "@/lib/org/setup-counts";
import { wizardSteps } from "@/lib/wizard/status";
import { WizardRail } from "./wizard-rail";

/** Event wizard shell: left rail (a step picker on tablets), each step saves on its own. */
export default async function EventWizardLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getOrgContext();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: event } = await supabase.from("events").select("id, name, slug, status, location, start_date, end_date").eq("id", id).maybeSingle();
  if (!event) notFound();
  const { data: divisions } = await supabase.from("divisions").select("id, name, scoring_model_id, format_template_id").eq("event_id", id).order("sort_order");
  const counts = await loadSetupCounts(supabase, id);
  const steps = wizardSteps(event, divisions ?? [], counts);

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start">
      <WizardRail eventId={id} eventName={event.name} status={event.status} steps={steps} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
