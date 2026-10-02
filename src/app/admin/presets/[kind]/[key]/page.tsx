import Link from "next/link";
import { notFound } from "next/navigation";
import { defaultVersion, MASTER_KINDS } from "@/lib/platform/master-presets";
import { loadVersions } from "@/lib/platform/preset-rows";
import { requireAdmin } from "@/lib/platform/session";
import { getPlatformSettings } from "@/lib/platform/public-settings";
import { formatWhen } from "@/lib/platform/event-label";
import { copy } from "@/lib/ui-copy";
import { PresetEditor } from "./editor";

export default async function EditPresetPage({ params }: { params: Promise<{ kind: string; key: string }> }) {
  const { kind: slug, key: rawKey } = await params;
  const key = decodeURIComponent(rawKey);
  const def = MASTER_KINDS.find((k) => k.slug === slug);
  if (!def) notFound();
  const { supabase, role } = await requireAdmin();
  const versions = await loadVersions(supabase, def.kind, key);
  if (versions.length === 0) notFound();
  const { defaultTimezone } = await getPlatformSettings();
  const base = defaultVersion(versions) ?? versions[0];

  // the JSON of the version the box starts from
  const table = def.kind === "scoring_model" ? "scoring_models" : def.kind === "format_template" ? "format_templates" : def.kind === "trick_vocabulary" ? "trick_vocabularies" : "presets";
  const { data: row } = await supabase.from(table as "scoring_models").select("json").eq("id", base.id).single();
  const c = copy.admin.presets;

  return (
    <main className="flex max-w-4xl flex-col gap-6">
      <Link href="/admin/presets" className="font-semibold underline">
        {c.back}
      </Link>
      <h1>{c.edit(versions[0].name)}</h1>
      <p className="text-lg font-semibold">
        {def.label} · {key} · {defaultVersion(versions) ? c.defaultLine(defaultVersion(versions)!.version) : c.noDefault}
      </p>
      <PresetEditor
        kind={def.kind}
        presetKey={key}
        isOwner={role === "owner"}
        versions={versions.map((v) => ({ ...v, createdLabel: formatWhen(v.created_at ?? null, defaultTimezone) }))}
        baseVersion={base.version}
        initialJson={JSON.stringify(row?.json ?? {}, null, 2)}
      />
    </main>
  );
}
