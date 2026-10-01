import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyLink } from "@/components/public/copy-link";
import { RiderRow } from "@/components/public/heat-summary";
import { RiderLabel } from "@/components/rider-label";
import { publicMetadata } from "@/lib/public/meta";
import { loadCore } from "@/lib/public/page-data";
import { buildRiderPage } from "@/lib/public/rider-model";
import { eventUrl, whatsappLink } from "@/lib/public/share";
import { requestOrigin } from "@/lib/platform/origin";
import { copy } from "@/lib/ui-copy";

export const dynamic = "force-dynamic";

const T = copy.pub.rider;
const UUID = /^[0-9a-f-]{36}$/i;

async function load(slug: string, entryId: string) {
  if (!UUID.test(entryId)) return null;
  const core = await loadCore(slug);
  if (!core) return null;
  const vm = buildRiderPage(entryId, core.results, core.site, core.tabs, core.tt);
  return vm ? { core, vm } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; entryId: string }> }) {
  const { slug, entryId } = await params;
  const got = await load(slug, entryId);
  if (!got) return { title: T.notFound };
  const last = got.vm.results[0];
  return publicMetadata(
    await requestOrigin(),
    got.core.site,
    `/riders/${entryId}`,
    { title: `${got.vm.name} · ${got.core.site.event.name}`, description: got.vm.ogDescription, image: last ? { kind: "heat", id: last.heat.id } : { kind: "event" } },
    `${got.vm.name} · ${got.core.site.event.name}`,
  );
}

/** A rider's page: when they ride next and when to be ready, their heats, their released results, and a card to share. */
export default async function RiderPage({ params }: { params: Promise<{ slug: string; entryId: string }> }) {
  const { slug, entryId } = await params;
  const got = await load(slug, entryId);
  if (!got) notFound();
  const { core, vm } = got;
  const origin = await requestOrigin();
  const url = eventUrl(origin, core.site.event.slug, `/riders/${entryId}`);
  return (
    <>
      <section data-testid="rider-card" className="flex flex-col gap-2 rounded-card border border-beach-line bg-beach-surface p-3">
        <RiderLabel model={vm.label} variant="live" bare />
        <p className="text-small font-medium text-beach-muted">
          {T.division}: {vm.divisionName}
        </p>
        <p data-testid="rider-next" className="text-name font-semibold">
          {vm.nextLine ?? T.noNext}
        </p>
      </section>

      <section aria-label={T.heats} className="flex flex-col gap-1.5">
        <h2 className="text-heading font-semibold text-beach-muted">{T.heats}</h2>
        <ol data-testid="rider-heats" className="flex flex-col divide-y divide-beach-line rounded-card border border-beach-line bg-beach-surface">
          {vm.heats.map((h) => (
            <li key={h.heatId} data-testid="rider-heat" className="flex items-center justify-between gap-2 px-2 py-1.5">
              <Link prefetch={false} href={`/e/${core.site.event.slug}/${h.state === "complete" ? "results" : "live"}?heat=${h.heatId}`} className="min-w-0 truncate text-body font-semibold underline-offset-2 hover:underline">
                {h.title}
              </Link>
              <span className="shrink-0 text-right text-small font-semibold tabular-nums">
                {h.state === "complete" ? `${h.place ?? ""}${h.totalLabel ? ` · ${h.totalLabel}` : ""}` : h.start ? `${h.estimated ? `${copy.pub.common.est} ` : ""}${h.start}${h.readyCall ? ` · ${T.ready(h.readyCall)}` : ""}` : T.pending}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label={T.results} className="flex flex-col gap-1.5">
        <h2 className="text-heading font-semibold text-beach-muted">{T.results}</h2>
        {vm.results.length ? vm.results.map((r) => (
          <div key={r.heat.id} className="flex flex-col gap-1">
            <p className="text-small font-semibold">{r.heat.title}</p>
            <RiderRow rider={r.row} heat={{ countedScores: r.heat.countedScores, mode: r.heat.mode }} />
          </div>
        )) : <p className="text-body font-medium">{T.noResults}</p>}
      </section>

      <section data-testid="rider-share" aria-label={T.share} className="flex flex-col gap-2 rounded-card border border-beach-line bg-beach-surface p-3">
        <h2 className="text-heading font-semibold text-beach-muted">{T.share}</h2>
        <p className="text-name font-semibold">{vm.shareText}</p>
        <div className="flex flex-wrap items-center gap-2">
          <a data-testid="share-whatsapp" href={whatsappLink(vm.shareText, url)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-tap items-center rounded-xl border border-beach-accent bg-beach-accent px-3 text-body font-semibold text-beach-on-accent">
            {copy.pub.share.whatsapp}
          </a>
          <CopyLink url={url} label={copy.pub.share.copy} doneLabel={copy.pub.share.copied} />
        </div>
      </section>
    </>
  );
}
