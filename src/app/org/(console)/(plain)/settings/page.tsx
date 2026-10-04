import { getDb, getOrgContext } from "@/lib/org/context";
import type { PresetRow } from "@/lib/presets/options";
import { knownTimeZones } from "@/lib/schemas/org-settings";
import { copy } from "@/lib/ui-copy";
import { SettingsForm } from "./settings-form";
import { PresetsCard } from "./presets-card";

export const metadata = { title: copy.orgSettings.heading };

export default async function SettingsPage() {
  const { current } = await getOrgContext();
  if (!current) return <p className="rounded-card border border-beach-line p-4 text-body font-semibold">{copy.orgHome.noOrg}</p>;
  const { supabase } = await getDb();
  const [{ data: models }, { data: formats }, { data: hiddenRows }, { data: defaultRows }] = await Promise.all([
    supabase.from("scoring_models").select("id, key, name, version, organisation_id, json, retired_at").or(`organisation_id.is.null,organisation_id.eq.${current.id}`),
    supabase.from("format_templates").select("id, key, name, version, organisation_id, json, retired_at").or(`organisation_id.is.null,organisation_id.eq.${current.id}`),
    supabase.from("organisation_hidden_presets").select("kind, key").eq("organisation_id", current.id),
    supabase.from("platform_default_presets").select("kind, key"),
  ]);
  const canEdit = current.role === "owner" || current.role === "admin";
  return (
    <main className="flex min-w-0 flex-col gap-4">
      <h1 className="text-[20px] font-semibold leading-tight">{copy.orgSettings.heading}</h1>
      {canEdit ? null : <p className="rounded-card border border-beach-line p-4 text-body font-semibold">{copy.orgSettings.readOnly}</p>}
      <SettingsForm
        canEdit={canEdit}
        timeZones={knownTimeZones()}
        initial={{
          id: current.id,
          name: current.name,
          slug: current.slug,
          logoUrl: current.logoUrl,
          defaultTimezone: current.settings.defaultTimezone,
        }}
      />
      <PresetsCard
        organisationId={current.id}
        scoring={(models ?? []) as PresetRow[]}
        formats={(formats ?? []) as PresetRow[]}
        hidden={{ scoring_model: (hiddenRows ?? []).filter((h) => h.kind === "scoring_model").map((h) => h.key), format_template: (hiddenRows ?? []).filter((h) => h.kind === "format_template").map((h) => h.key) }}
        defaults={{ scoring_model: (defaultRows ?? []).find((d) => d.kind === "scoring_model")?.key ?? null, format_template: (defaultRows ?? []).find((d) => d.kind === "format_template")?.key ?? null }}
      />
    </main>
  );
}
