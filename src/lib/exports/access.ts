import { excludeSimulations } from "@/lib/exports/exclude-simulations";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { copy } from "@/lib/ui-copy";

const R = copy.exportFiles.refused;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ExportKind = "results" | "backup";
export type UserDb = Awaited<ReturnType<typeof createClient>>;
export type ServiceDb = ReturnType<typeof createServiceClient>;

export interface ExportEvent {
  id: string;
  organisation_id: string;
  name: string;
  slug: string;
  timezone: string;
  status: string;
  is_simulation: boolean;
}

export type Access = { ok: true; role: "organiser" | "head"; userId: string; userName: string | null; db: UserDb; service: ServiceDb; event: ExportEvent } | { ok: false; status: 401 | 403 | 404 | 409; sentence: string };

/**
 * Who may export, decided by the database (`export_role`): an organiser of the event (or the platform owner), or the event's head judge for the results. Judges,
 * spotters, announcers, observers, the public and signed-out visitors are refused here and again by `log_export`. The draft box is the organiser's alone.
 * A practice (simulation) event never exports: excludeSimulations leaves it out.
 */
export async function authoriseExport(eventId: string, kind: ExportKind, includeDraft = false): Promise<Access> {
  if (!UUID.test(eventId)) return { ok: false, status: 404, sentence: R.notFound };
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { ok: false, status: 401, sentence: R.signIn };
  const { data: role } = await db.rpc("export_role", { p_event: eventId });
  if (role !== "organiser" && role !== "head") return { ok: false, status: 403, sentence: kind === "backup" ? R.backup : R.results };
  if (kind === "backup" && role !== "organiser") return { ok: false, status: 403, sentence: R.backup };
  if (includeDraft && role !== "organiser") return { ok: false, status: 403, sentence: R.draft };
  const service = createServiceClient();
  const { data: event } = await service.from("events").select("id, organisation_id, name, slug, timezone, status, is_simulation").eq("id", eventId).maybeSingle();
  if (!event) return { ok: false, status: 404, sentence: R.notFound };
  if (excludeSimulations([event]).length === 0) return { ok: false, status: 409, sentence: R.simulation };
  return { ok: true, role, userId: user.id, userName: user.email ?? null, db, service, event };
}
