import { authoriseExport } from "@/lib/exports/access";
import { loadResultsExport } from "@/lib/exports/load-results";
import { buildResultsCsv, exportFileName } from "@/lib/export-format/results-export";
import { copy } from "@/lib/ui-copy";

export const dynamic = "force-dynamic";

const refuse = (status: number, error: string) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/** Download results: the CSV of every released heat (and, for an organiser who ticked the box, the draft heats). Read-only; its one write is its audit line. */
export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const includeDraft = new URL(request.url).searchParams.get("draft") === "1";
  const a = await authoriseExport(eventId, "results", includeDraft);
  if (!a.ok) return refuse(a.status, a.sentence);
  try {
    const loaded = await loadResultsExport(a, includeDraft);
    if (!loaded.ok) return refuse(409, loaded.sentence);
    const { csv, heatCount } = buildResultsCsv(loaded.input);
    const { error } = await a.db.rpc("log_export", { p_event: eventId, p_kind: "results_csv", p_include_draft: includeDraft, p_heats: heatCount });
    if (error) return refuse(500, copy.exportFiles.refused.failed);
    const name = exportFileName(a.event.slug, "results", "csv", loaded.input.exportedAt, a.event.timezone);
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
  } catch {
    return refuse(500, copy.exportFiles.refused.failed);
  }
}
