import { notFound } from "next/navigation";
import { RiderReportView } from "@/components/report/report-view";
import { Updating } from "@/components/public/updating";
import { buildRiderReport } from "@/lib/engine/report";
import { admitPublicRequest, loadDraw, loadRiderReportData, loadRiderReportPreview, loadRules, loadSite } from "@/lib/public/load";
import { reportContextFrom } from "@/lib/public/rider-report";
import { riderPageHref } from "@/lib/public/report-links";
import { copy } from "@/lib/ui-copy";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;
const R = copy.report;

async function load(slug: string, entryId: string, preview: boolean) {
  if (!UUID.test(entryId)) return null;
  const site = await loadSite(slug);
  if (!site) return null;
  const data = preview ? await loadRiderReportPreview(site.event.id) : await loadRiderReportData(site.event.id);
  if (!data) return null;
  const [rules, draw] = await Promise.all([loadRules(site.event.id), loadDraw(site.event.id)]);
  const report = buildRiderReport(reportContextFrom(data, rules, draw), entryId);
  return { site, report };
}

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string; entryId: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { slug, entryId } = await params;
  const preview = (await searchParams).preview === "1";
  const got = await load(slug, entryId, preview);
  if (!got || (got.report.status !== "ok" && got.report.status !== "no_heats")) return { title: R.notAvailable, robots: { index: false } };
  const r = got.report;
  // a report is for the rider and whoever he shares it with: it stays out of search engines, and a preview is never shared at all
  return { title: R.pageTitle(r.name, r.eventName), robots: { index: false, follow: false } };
}

/**
 * A rider's report. Read as a visitor through the one rider-safe function, or (with ?preview=1) as the signed-in organiser through the preview function. Anything that is
 * not a report the visitor may read (setting Off, not open yet, unknown rider, a rider under 18) is the same "not available" page, so the page never says which.
 */
export default async function RiderReportPage({ params, searchParams }: { params: Promise<{ slug: string; entryId: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { slug, entryId } = await params;
  const preview = (await searchParams).preview === "1";
  if (!(await admitPublicRequest())) return <Updating />;
  const got = await load(slug, entryId, preview);
  if (!got || got.report.status === "not_found" || got.report.status === "withheld") notFound();
  const back = riderPageHref(got.site.event.slug, entryId);
  const r = got.report;
  if (r.status === "no_heats") {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-3 px-4 py-8" data-testid="report-no-heats">
        <h1 className="text-heading font-semibold">{r.name}</h1>
        <p className="text-body font-medium">{R.noHeats}</p>
        <a href={back} className="text-body font-semibold underline">
          {R.back}
        </a>
      </main>
    );
  }
  return <RiderReportView report={r} backHref={back} preview={preview} />;
}
