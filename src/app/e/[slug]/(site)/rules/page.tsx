import { notFound } from "next/navigation";
import { guardTab } from "@/lib/public/tab-guard";
import { loadCore } from "@/lib/public/page-data";
import { publicMetadata } from "@/lib/public/meta";
import { eventOg } from "@/lib/public/og";
import { buildRules } from "@/lib/public/rules-model";
import { requestOrigin } from "@/lib/platform/origin";
import { copy } from "@/lib/ui-copy";

export const dynamic = "force-dynamic";

const R = copy.pub.rules;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const core = await loadCore((await params).slug);
  if (!core) return { title: copy.pub.common.notFound };
  const og = eventOg(core.site, core.tt, core.tabs);
  return publicMetadata(await requestOrigin(), core.site, "/rules", { ...og, title: `${R.title} · ${core.site.event.name}` }, `${R.title} · ${core.site.event.name}`);
}

/** How each division is scored, generated from its scoring model and format: riders and spectators never have to ask. */
export default async function RulesPage({ params }: { params: Promise<{ slug: string }> }) {
  const core = await loadCore((await params).slug);
  if (!core) notFound();
  guardTab(core.site, "rules");
  const divisions = buildRules(core.rules, core.site);
  return (
    <>
      <h2 className="text-heading font-semibold">{R.title}</h2>
      <p className="text-body font-medium text-beach-muted">{R.intro}</p>
      {divisions.length > 1 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={copy.pub.results.divisionTabs}>
          {divisions.map((d) => (
            <li key={d.id}>
              <a href={`#division-${d.id}`} className="inline-flex min-h-[36px] items-center rounded-xl border border-beach-line bg-beach-surface px-3 text-body font-semibold">
                {d.name}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {divisions.map((d) => (
        <section key={d.id} id={`division-${d.id}`} data-testid="rules-division" className="flex flex-col gap-2 rounded-card border border-beach-line bg-beach-surface p-3">
          <h3 className="text-name font-semibold">{d.name}</h3>
          {d.summary ? (
            <p data-testid="rules-summary" className="text-body font-semibold">
              {d.summary}
            </p>
          ) : null}
          {d.description ? <p className="text-body font-medium text-beach-muted">{d.description}</p> : null}
          {d.sections.map((s) => (
            <div key={s.key} data-testid={`rules-${s.key}`} className="flex flex-col gap-0.5">
              <h4 className="text-small font-semibold uppercase tracking-wide text-beach-muted">{s.heading}</h4>
              {s.lines.map((line, i) => (
                <p key={i} className="whitespace-pre-wrap text-body font-medium">
                  {line}
                </p>
              ))}
              {s.key === "identification" && d.legend.length ? (
                <ul data-testid="rules-legend" className="mt-1 flex flex-wrap gap-1.5">
                  {d.legend.map((c) => (
                    <li key={c.key} className="inline-flex items-center gap-1.5 rounded-lg border border-beach-line px-2 py-0.5 text-body font-semibold">
                      <span aria-hidden className="inline-block size-4 rounded-full border border-beach-ink" style={{ backgroundColor: c.hex }} />
                      {c.label}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
