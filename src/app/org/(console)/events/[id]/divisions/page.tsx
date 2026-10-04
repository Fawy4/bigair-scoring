import { notFound } from "next/navigation";
import { getDb } from "@/lib/org/context";
import { loadEventBlocks, loadMasterVocabulary } from "@/lib/org/trick-vocabulary";
import { identificationSchemesFrom } from "@/lib/org/presets";
import { divisionScheme } from "@/lib/identification/division-scheme";
import { parseEventSettings } from "@/lib/schemas/event-settings";
import { defaultScheme } from "@/lib/schemas/identification";
import type { PresetRow } from "@/lib/presets/options";
import { copy } from "@/lib/ui-copy";
import { LockNotice } from "./lock-notice";
import { DivisionsManager, type DivisionRow } from "./divisions-manager";

export const metadata = { title: copy.wizard.steps.divisions };

export default async function DivisionsStepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getDb();
  // everything the page shows is asked for at the same time (one round, not four): the event with its organisation's saved Rider labels, the divisions, the heats,
  // the rule and format presets, the riders and the trick base
  const [{ data: event }, { data: divisions }, { data: started }, { data: withHeats }, { data: models }, { data: formats }, { data: entryRows }, master, localBlocks] = await Promise.all([
    supabase.from("events").select("id, organisation_id, settings, organisations(presets(key, version, json))").eq("id", id).eq("organisations.presets.kind", "identification").maybeSingle(),
    supabase
      .from("divisions")
      .select("id, name, sort_order, scoring_model_id, scoring_overrides, format_template_id, format_params, rules_unlocked_at, description, identification, trick_base, live_settings, draw_locked_at")
      .eq("event_id", id)
      .order("sort_order")
      .order("created_at"),
    supabase.from("heats").select("division_id").eq("event_id", id).not("started_at", "is", null),
    supabase.from("heats").select("division_id").eq("event_id", id),
    supabase.from("scoring_models").select("id, key, name, version, organisation_id, json"),
    supabase.from("format_templates").select("id, key, name, version, organisation_id, json"),
    supabase.from("entries").select("id, division_id, seed, created_at, riders(first_name, last_name)").eq("event_id", id).eq("status", "confirmed"),
    loadMasterVocabulary(supabase),
    loadEventBlocks(supabase, id),
  ]);
  if (!event) notFound();
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
    description: d.description,
    identification: divisionScheme(d.identification) ? { scheme: divisionScheme(d.identification)!, basedOn: (d.identification as { basedOn?: string } | null)?.basedOn } : null,
    trickBase: d.trick_base,
    liveSettings: d.live_settings,
    started: startedIds.has(d.id),
    hasHeats: heatIds.has(d.id),
    locked: startedIds.has(d.id) && d.rules_unlocked_at === null,
    drawLocked: Boolean(d.draw_locked_at),
    riders: (entryRows ?? [])
      .filter((e) => e.division_id === d.id)
      .sort((a, b) => (a.seed ?? Number.MAX_SAFE_INTEGER) - (b.seed ?? Number.MAX_SAFE_INTEGER) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      .map((e) => ({ id: e.id, name: `${e.riders?.first_name ?? ""} ${e.riders?.last_name ?? ""}`.trim() || "Rider" })),
  }));

  const settings = parseEventSettings(event.settings);
  const schemes = identificationSchemesFrom(event.organisations?.presets ?? []);
  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1>{copy.divisions.stepHeading}</h1>
        <p className="max-w-[70ch] text-body font-medium text-beach-muted">{copy.divisions.intro}</p>
      </div>
      <LockNotice />
      <DivisionsManager
        eventId={id}
        organisationId={event.organisation_id}
        eventScheme={settings.identification?.scheme ?? defaultScheme()}
        allowOverride={settings.identification?.allowDivisionOverride ?? false}
        schemes={schemes}
        vocabulary={master?.vocabulary ?? null}
        localBlocks={localBlocks}
        initialDivisions={rows}
        initialScoring={(models ?? []) as PresetRow[]}
        initialFormats={(formats ?? []) as PresetRow[]}
      />
    </main>
  );
}
