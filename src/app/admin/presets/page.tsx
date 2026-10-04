import Link from "next/link";
import { defaultVersion, MASTER_KINDS } from "@/lib/platform/master-presets";
import { loadPresetSummaries } from "@/lib/platform/preset-rows";
import { requireAdmin } from "@/lib/platform/session";
import { copy } from "@/lib/ui-copy";
import { MasterList } from "./master-list";

export const metadata = { title: copy.admin.presets.heading };

export default async function MasterPresetsPage() {
  const { supabase, role } = await requireAdmin();
  const groups = await Promise.all(MASTER_KINDS.map(async (k) => ({ ...k, presets: await loadPresetSummaries(supabase, k.kind) })));
  const { data: defaults } = await supabase.from("platform_default_presets").select("kind, key");
  const defaultKey = (kind: string) => (defaults ?? []).find((d) => d.kind === kind)?.key ?? null;
  const proposals = ((await supabase.rpc("admin_trick_proposals")).data ?? []).length;
  const c = copy.admin.presets;
  return (
    <main className="flex flex-col gap-8">
      <h1>{c.heading}</h1>
      <p className="max-w-[70ch] text-lg font-semibold">{c.intro}</p>
      {groups.map((g) => (
        <section key={g.kind} className="flex flex-col gap-3" aria-labelledby={`h-${g.kind}`}>
          <h2 id={`h-${g.kind}`} className="text-2xl font-semibold">
            {g.label}
          </h2>
          {g.presets.length === 0 ? <p className="font-semibold">{c.none}</p> : null}
          {g.kind === "scoring_model" || g.kind === "format_template" ? (
            <MasterList
              kind={g.kind}
              slug={g.slug}
              isOwner={role === "owner"}
              rows={g.presets.map((p) => ({
                key: p.key,
                name: p.name,
                latestVersion: p.versions[0]?.version ?? 1,
                hasDraft: p.versions.some((v) => !v.published_at),
                retired: p.versions.some((v) => v.retired_at),
                isDefault: p.key === defaultKey(g.kind),
              }))}
            />
          ) : (
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
                  <Link href={g.kind === "trick_vocabulary" ? "/admin/presets/trick-base" : `/admin/presets/${g.slug}/${encodeURIComponent(p.key)}`} className="btn" aria-label={c.edit(p.name)} data-testid={g.kind === "trick_vocabulary" ? "open-trick-base" : undefined}>
                    {g.kind === "trick_vocabulary" ? c.openTrickBase(proposals) : c.edit(p.name)}
                  </Link>
                </li>
              );
            })}
          </ul>
          )}
        </section>
      ))}
    </main>
  );
}
