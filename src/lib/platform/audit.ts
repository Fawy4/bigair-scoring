import { copy } from "@/lib/ui-copy";

const a = copy.admin.audit;

/** Plain-language name for an audit action; unknown ones (like the scoring triggers' "insert") stay readable. */
export function auditLabel(action: string): string {
  return a.actions[action] ?? action.replace(/_/g, " ");
}

type Json = Record<string, unknown> | null;
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** One short line of detail for a row. Nothing secret is ever in the log, so this only picks the useful fields. */
export function auditDetails(row: { action: string; before: Json; after: Json; reason: string | null }): string {
  const parts: string[] = [];
  if (row.action === "organisation_renamed") parts.push(a.detail.rename(str(row.before?.name), str(row.after?.name)));
  else if (row.action === "event_moved") parts.push(a.detail.eventMoved(str(row.after?.event), str(row.before?.organisation), str(row.after?.organisation)));
  else if (row.action === "preset_published" || row.action === "preset_version_created") parts.push(a.detail.preset(str(row.after?.key), Number(row.after?.version ?? 0)));
  else if (row.action === "organiser_added") parts.push(a.detail.organiser(str(row.after?.role)));
  if (row.reason) parts.push(a.detail.reason(row.reason));
  return parts.join(" · ");
}
