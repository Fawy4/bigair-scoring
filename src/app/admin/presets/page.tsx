import Link from "next/link";
import { defaultVersion, MASTER_KINDS } from "@/lib/platform/master-presets";
import { loadPresetSummaries } from "@/lib/platform/preset-rows";
import { requireAdmin } from "@/lib/platform/session";
import { copy } from "@/lib/ui-copy";

export const metadata = { title: copy.admin.presets.heading };

export default async function MasterPresetsPage() {
  const { supabase } = await requireAdmin();
  const groups = await Promise.all(MASTER_KINDS.map(async (k) => ({ ...k, presets: await loadPresetSummaries(supabase, k.kind) })));
  const c = copy.admin.presets;
  return (
    <main className="flex flex-col gap-8">
      <h1>{c.heading}</h1>
      <p className="max-w-3xl text-lg font-semibold">{c.intro}</p>
      {groups.map((g) => (
        <section key={g.kind} className="flex flex-col gap-3" aria-labelledby={`h-${g.kind}`}>
          <h2 id={`h-${g.kind}`} className="text-2xl font-semibold">
            {g.label}
          </h2>
          {g.presets.length === 0 ? <p className="font-semibold">{c.none}</p> : null}
          <ul className="flex flex-col gap-2">
            {g.presets.map((p) => {
              const def = defaultVersion(p.versions);
              const drafts = p.versions.filter((v) => !v.published_at).map((v) => `v${v.version}`);
              return (
                <li key={p.key} className="panel flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xl font-semibold">{p.name}</p>
                    <p className="font-semibold">
                      {p.key} · {def ? c.defaultLine(def.version) : c.noDefault}
                      {drafts.length ? ` · ${c.draftLine(drafts.join(", "))}` : ""}
                    </p>
                  </div>
                  <Link href={`/admin/presets/${g.slug}/${encodeURIComponent(p.key)}`} className="btn" aria-label={c.edit(p.name)}>
                    {c.edit(p.name)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
