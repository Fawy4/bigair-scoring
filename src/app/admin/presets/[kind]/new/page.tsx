import Link from "next/link";
import { notFound } from "next/navigation";
import { MASTER_KINDS } from "@/lib/platform/master-presets";
import type { PresetRow } from "@/lib/presets/options";
import { requireAdmin } from "@/lib/platform/session";
import { copy } from "@/lib/ui-copy";
import { MasterPresetForm } from "../[key]/master-form";

export const metadata = { title: copy.admin.presets.manage.add };

/** Add a built-in preset: the same form as the organiser's, starting empty (the Load… menu offers a built-in to start from). */
export default async function NewPresetPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind: slug } = await params;
  const def = MASTER_KINDS.find((k) => k.slug === slug);
  if (!def || (def.kind !== "scoring_model" && def.kind !== "format_template")) notFound();
  const { supabase } = await requireAdmin();
  const table = def.kind === "scoring_model" ? "scoring_models" : "format_templates";
  const { data } = await supabase.from(table).select("id, key, name, version, organisation_id, json, retired_at, published_at").is("organisation_id", null).not("published_at", "is", null);
  const c = copy.admin.presets;
  return (
    <main className="flex flex-col gap-6">
      <Link href="/admin/presets" className="font-semibold underline">
        {c.back}
      </Link>
      <h1>{c.manage.addHeading(def.label)}</h1>
      <MasterPresetForm kind={def.kind} presets={(data ?? []) as PresetRow[]} baseId={null} presetKey={null} initialName="" />
    </main>
  );
}
