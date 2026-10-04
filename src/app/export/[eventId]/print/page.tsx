import { notFound } from "next/navigation";
import { ResultsPrintView } from "@/components/export/results-print-view";
import { authoriseExport } from "@/lib/exports/access";
import { loadResultsExport } from "@/lib/exports/load-results";
import { copy } from "@/lib/ui-copy";

export const metadata = { title: copy.exportFiles.print.title, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** The printable results: every released heat the way the public results page shows it, division by division, the newest heat first. Opens in a new tab; print or save as PDF from the browser. */
export default async function PrintResultsPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ draft?: string }> }) {
  const { eventId } = await params;
  const includeDraft = (await searchParams).draft === "1";
  const a = await authoriseExport(eventId, "results", includeDraft);
  if (!a.ok) notFound();
  const loaded = await loadResultsExport(a, includeDraft);
  if (!loaded.ok) return <p data-testid="export-refused" className="p-4 text-body font-semibold">{loaded.sentence}</p>;
  const { error } = await a.db.rpc("log_export", { p_event: eventId, p_kind: "results_print", p_include_draft: includeDraft });
  if (error) return <p data-testid="export-refused" className="p-4 text-body font-semibold">{copy.exportFiles.refused.failed}</p>;
  return <ResultsPrintView input={loaded.input} />;
}
