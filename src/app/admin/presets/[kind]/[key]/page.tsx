import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { defaultVersion, MASTER_KINDS } from "@/lib/platform/master-presets";
import { loadVersions } from "@/lib/platform/preset-rows";
import { requireAdmin } from "@/lib/platform/session";
import { getPlatformSettings } from "@/lib/platform/public-settings";
import { formatWhen } from "@/lib/platform/event-label";
import { copy } from "@/lib/ui-copy";
import { PresetEditor } from "./editor";
import { MasterPresetForm } from "./master-form";
import type { PresetRow } from "@/lib/presets/options";

export default async function EditPresetPage({ params }: { params: Promise<{ kind: string; key: string }> }) {
  const { kind: slug, key: rawKey } = await params;
  const key = decodeURIComponent(rawKey);
  const def = MASTER_KINDS.find((k) => k.slug === slug);
  if (!def) notFound();
  if (def.kind === "trick_vocabulary") redirect("/admin/presets/trick-base"); // the form editor, with this JSON under its Advanced fold
  const { supabase, role } = await requireAdmin();
  const versions = await loadVersions(supabase, def.kind, key);
  if (versions.length === 0) notFound();
  const { defaultTimezone } = await getPlatformSettings();
  const base = defaultVersion(versions) ?? versions[0];

  // the JSON of the version the box starts from
  const table = def.kind === "scoring_model" ? "scoring_models" : def.kind === "format_template" ? "format_templates" : "presets";
  const { data: row } = await supabase.from(table as "scoring_models").select("json").eq("id", base.id).single();
  const c = copy.admin.presets;
  const isForm = def.kind === "scoring_model" || def.kind === "format_template";
  // the form starts from the newest version (a draft included); the Load… menu offers the published built-ins as other starting points
  const latest = versions[0];
  const { data: all } = isForm ? await supabase.from(table as "scoring_models").select("id, key, name, version, organisation_id, json, retired_at, published_at").is("organisation_id", null) : { data: [] };
  const rowsForForm = ((all ?? []) as Array<PresetRow & { published_at: string | null }>).filter((r) => r.published_at || r.id === latest.id);
  const { data: latestJson } = isForm ? await supabase.from(table as "scoring_models").select("json").eq("id", latest.id).single() : { data: null };

  return (
    <main className="flex flex-col gap-6">
      <Link href="/admin/presets" className="font-semibold underline">
        {c.back}
      </Link>
      <h1>{c.edit(versions[0].name)}</h1>
      <p className="text-lg font-semibold">
        {def.label} · {key} · {defaultVersion(versions) ? c.defaultLine(defaultVersion(versions)!.version) : c.noDefault}
      </p>
      {isForm ? (
        <section className="flex flex-col gap-2" aria-label={copy.admin.presets.manage.formHeading}>
          <p className="max-w-[70ch] font-semibold">{copy.admin.presets.manage.sourceNote}</p>
          <MasterPresetForm
            key={latest.id}
            kind={def.kind as "scoring_model" | "format_template"}
            presets={rowsForForm.map((r) => (r.id === latest.id ? { ...r, json: latestJson?.json ?? r.json } : r))}
            baseId={latest.id}
            presetKey={key}
            initialName={latest.name}
          />
        </section>
      ) : null}
      <details open={!isForm} className="flex flex-col gap-3" data-testid="master-json">
        <summary className="cursor-pointer text-xl font-semibold">{copy.admin.presets.manage.advancedJson}</summary>
      <PresetEditor
        kind={def.kind}
        presetKey={key}
        isOwner={role === "owner"}
        versions={versions.map((v) => ({ ...v, createdLabel: formatWhen(v.created_at ?? null, defaultTimezone) }))}
        baseVersion={base.version}
        initialJson={JSON.stringify(row?.json ?? {}, null, 2)}
      />
      </details>
    </main>
  );
}
