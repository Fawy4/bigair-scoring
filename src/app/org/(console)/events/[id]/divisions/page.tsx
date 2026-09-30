import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/org/context";
import type { PresetRow } from "@/lib/presets/options";
import { copy } from "@/lib/ui-copy";
import { DivisionsManager, type DivisionRow } from "./divisions-manager";

export const metadata = { title: copy.wizard.steps.divisions };

export default async function DivisionsStepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getOrgContext();
  const { data: event } = await supabase.from("events").select("id, organisation_id").eq("id", id).maybeSingle();
  if (!event) notFound();

  const [{ data: divisions }, { data: started }, { data: withHeats }, { data: models }, { data: formats }] = await Promise.all([
    supabase
      .from("divisions")
      .select("id, name, sort_order, scoring_model_id, scoring_overrides, format_template_id, format_params, rules_unlocked_at")
      .eq("event_id", id)
      .order("sort_order")
      .order("created_at"),
    supabase.from("heats").select("division_id").eq("event_id", id).not("started_at", "is", null),
    supabase.from("heats").select("division_id").eq("event_id", id),
    supabase.from("scoring_models").select("id, key, name, version, organisation_id, json"),
    supabase.from("format_templates").select("id, key, name, version, organisation_id, json"),
  ]);
  const startedIds = new Set((started ?? []).map((h) => h.division_id));
  const heatIds = new Set((withHeats ?? []).map((h) => h.division_id));

  const rows: DivisionRow[] = (divisions ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    sort_order: d.sort_order,
    scoring_model_id: d.scoring_model_id,
    scoring_overrides: d.scoring_overrides,
    format_template_id: d.format_template_id,
    format_params: d.format_params,
    hasHeats: heatIds.has(d.id),
    locked: startedIds.has(d.id) && d.rules_unlocked_at === null,
  }));

  return (
    <main className="flex max-w-4xl flex-col gap-6">
      <h1 className="text-3xl font-extrabold">{copy.divisions.stepHeading}</h1>
      <p className="font-semibold">{copy.divisions.intro}</p>
      <p className="panel font-bold" role="note" data-testid="lock-banner">
        {copy.divisions.lockBanner}
      </p>
      <DivisionsManager
        eventId={id}
        organisationId={event.organisation_id}
        initialDivisions={rows}
        initialScoring={(models ?? []) as PresetRow[]}
        initialFormats={(formats ?? []) as PresetRow[]}
      />
    </main>
  );
}
