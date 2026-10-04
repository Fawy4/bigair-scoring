import { authoriseExport } from "@/lib/exports/access";
import { loadBackup } from "@/lib/exports/load-backup";
import { exportFileName } from "@/lib/export-format/results-export";
import { copy } from "@/lib/ui-copy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const refuse = (status: number, error: string) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/** Download event backup: the whole event as one JSON file. Organisers only (the head judge is refused). Read-only; its one write is its audit line. */
export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const a = await authoriseExport(eventId, "backup");
  if (!a.ok) return refuse(a.status, a.sentence);
  try {
    const loaded = await loadBackup(a);
    if (!loaded.ok) return refuse(409, loaded.sentence);
    const { error } = await a.db.rpc("log_export", { p_event: eventId, p_kind: "backup" });
    if (error) return refuse(500, copy.exportFiles.refused.failed);
    const name = exportFileName(a.event.slug, "backup", "json", loaded.file.exportedAt, a.event.timezone);
    return new Response(JSON.stringify(loaded.file, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
  } catch {
    return refuse(500, copy.exportFiles.refused.failed);
  }
}
