"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { cleanIdentifiers } from "@/lib/riders/identifiers";
import { copy } from "@/lib/ui-copy";

const T = copy.riders.errors;

export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

const Uuid = z.string().uuid();
const Text = (max: number) => z.string().trim().max(max);
const Optional = (max: number) => Text(max).optional().transform((v) => (v ? v : null));

const RiderFields = z.object({
  first: Text(60).min(1, T.nameRequired),
  last: Text(60).min(1, T.nameRequired),
  nationality: Optional(60),
  email: z.string().trim().toLowerCase().max(254).optional().transform((v) => (v ? v : null)).refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), T.badEmail),
  phone: Optional(30),
  sponsor: Optional(100),
  photoUrl: Text(500).optional().transform((v) => (v ? v : null)).refine((v) => v === null || /^https?:\/\/\S+$/i.test(v) || /^[0-9a-f-]{36}\/[^/]+\/[^/]+$/.test(v), T.badValue),
});

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const dbError = (e: { code?: string; message: string }) => (e.code === "23505" ? T.emailUsed : /NOT_ALLOWED|permission|row-level/i.test(e.message) ? T.notAllowed : T.failed);

async function divisionOrg(divisionId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("divisions").select("id, event_id, events(organisation_id)").eq("id", divisionId).maybeSingle();
  const orgId = data?.events?.organisation_id ?? null;
  return { supabase, orgId, eventId: data?.event_id ?? null };
}

async function nextSeed(supabase: Awaited<ReturnType<typeof createClient>>, divisionId: string): Promise<number> {
  const { data } = await supabase.from("entries").select("seed").eq("division_id", divisionId).not("seed", "is", null).order("seed", { ascending: false }).limit(1);
  return (data?.[0]?.seed ?? 0) + 1;
}

/** "+ Add rider": creates the rider in the organisation (or finds the same email) and enters them in the division. */
export async function addRider(divisionId: string, input: z.input<typeof RiderFields>): Promise<Result<{ entryId: string }>> {
  if (!Uuid.safeParse(divisionId).success) return fail(T.unknownDivision);
  const parsed = RiderFields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? T.badValue);
  const v = parsed.data;
  const { supabase, orgId, eventId } = await divisionOrg(divisionId);
  if (!orgId || !eventId) return fail(T.unknownDivision);

  let riderId: string | null = null;
  if (v.email) {
    const { data: existing } = await supabase.from("riders").select("id").eq("organisation_id", orgId).ilike("email", v.email).maybeSingle();
    riderId = existing?.id ?? null;
  }
  if (!riderId) {
    const { data, error } = await supabase
      .from("riders")
      .insert({ organisation_id: orgId, first_name: v.first, last_name: v.last, nationality: v.nationality, email: v.email, phone: v.phone, sponsor: v.sponsor, photo_url: v.photoUrl })
      .select("id")
      .single();
    if (error) return fail(dbError(error));
    riderId = data.id;
  }
  const { data: entry, error } = await supabase
    .from("entries")
    .insert({ event_id: eventId, division_id: divisionId, rider_id: riderId, seed: await nextSeed(supabase, divisionId), status: "confirmed", source: "manual" })
    .select("id")
    .single();
  if (error) return fail(error.code === "23505" ? T.alreadyInDivision : dbError(error));
  return { ok: true, entryId: entry.id };
}

/** Inline edit of the person: name, nationality, contact, sponsor, photo. */
export async function saveRider(riderId: string, patch: z.input<typeof RiderFields>): Promise<Result> {
  if (!Uuid.safeParse(riderId).success) return fail(T.failed);
  const parsed = RiderFields.safeParse(patch);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? T.badValue);
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("riders")
    .update({ first_name: v.first, last_name: v.last, nationality: v.nationality, email: v.email, phone: v.phone, sponsor: v.sponsor, photo_url: v.photoUrl })
    .eq("id", riderId)
    .select("id");
  if (error) return fail(dbError(error));
  return data?.length ? { ok: true } : fail(T.notAllowed);
}

const EntryPatch = z.object({
  seed: z.number().int().min(1).max(9999).nullable().optional(),
  status: z.enum(["confirmed", "withdrawn", "no_show"]).optional(),
  identifiers: z.unknown().optional(),
});

/** Inline edit of the entry: seed number, status (taking part / withdrawn / no-show) and the identifier cells. */
export async function saveEntry(entryId: string, patch: z.input<typeof EntryPatch>): Promise<Result> {
  if (!Uuid.safeParse(entryId).success) return fail(T.failed);
  const parsed = EntryPatch.safeParse(patch);
  if (!parsed.success) return fail(T.badValue);
  const update: { seed?: number | null; status?: "confirmed" | "withdrawn" | "no_show"; identifiers?: never } = {};
  if (parsed.data.seed !== undefined) update.seed = parsed.data.seed;
  if (parsed.data.status) update.status = parsed.data.status;
  if (parsed.data.identifiers !== undefined) update.identifiers = cleanIdentifiers(parsed.data.identifiers) as never;
  if (Object.keys(update).length === 0) return { ok: true };
  const supabase = await createClient();
  const { data, error } = await supabase.from("entries").update(update).eq("id", entryId).select("id");
  if (error) return fail(dbError(error));
  return data?.length ? { ok: true } : fail(T.notAllowed);
}

const ImportedRow = z.object({
  first: Text(60).min(1),
  last: Text(60).min(1),
  nationality: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  sponsor: z.string().nullable().optional(),
  seed: z.number().int().min(1).max(9999).nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  identifiers: z.unknown().optional(),
});

/** Saves the valid rows of a CSV preview in one transaction. The preview did all the checking; this repeats the essentials. */
export async function importRiderRows(divisionId: string, rows: unknown): Promise<Result<{ created: number; matched: number; already: number }>> {
  if (!Uuid.safeParse(divisionId).success) return fail(T.unknownDivision);
  const parsed = z.array(ImportedRow).min(1).max(500).safeParse(rows);
  if (!parsed.success) return fail(copy.riders.importFailed);
  const supabase = await createClient();
  const payload = parsed.data.map((r) => ({ ...r, identifiers: cleanIdentifiers(r.identifiers) }));
  const { data, error } = await supabase.rpc("import_riders", { p_division: divisionId, p_rows: payload as never });
  if (error) return fail(/NOT_ALLOWED/.test(error.message) ? T.notAllowed : copy.riders.importFailed);
  const r = data as { created: number; matched: number; already: number };
  return { ok: true, created: r.created, matched: r.matched, already: r.already };
}

/** "Add from this organisation's riders". */
export async function addOrganisationRiders(divisionId: string, riderIds: string[]): Promise<Result<{ added: number }>> {
  if (!Uuid.safeParse(divisionId).success) return fail(T.unknownDivision);
  const ids = z.array(Uuid).min(1).max(500).safeParse(riderIds);
  if (!ids.success) return fail(T.failed);
  const { supabase, orgId, eventId } = await divisionOrg(divisionId);
  if (!orgId || !eventId) return fail(T.unknownDivision);
  let seed = await nextSeed(supabase, divisionId);
  const { data, error } = await supabase
    .from("entries")
    .upsert(ids.data.map((riderId) => ({ event_id: eventId, division_id: divisionId, rider_id: riderId, seed: seed++, status: "confirmed" as const, source: "manual" as const })), { onConflict: "division_id,rider_id", ignoreDuplicates: true })
    .select("id");
  if (error) return fail(dbError(error));
  return { ok: true, added: data?.length ?? 0 };
}

/** The order after a drag, a tap, a shuffle or "Sort by seed number": everybody is renumbered 1, 2, 3… in one step. */
export async function saveOrder(divisionId: string, entryIds: string[], shuffleSeed: number | null): Promise<Result> {
  if (!Uuid.safeParse(divisionId).success) return fail(T.unknownDivision);
  const ids = z.array(Uuid).max(1000).safeParse(entryIds);
  if (!ids.success) return fail(T.failed);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_entry_order", { p_division: divisionId, p_entry_ids: ids.data, p_shuffle_seed: shuffleSeed ?? undefined });
  return error ? fail(/NOT_ALLOWED|ENTRY_NOT_IN_DIVISION/.test(error.message) ? T.notAllowed : T.failed) : { ok: true };
}

/** Approve (confirmed, placed after the last seed) or decline (with an optional reason) a registration from the public page. */
export async function decideRegistration(entryId: string, decision: "approve" | "decline", reason?: string): Promise<Result> {
  if (!Uuid.safeParse(entryId).success) return fail(T.failed);
  const supabase = await createClient();
  const { data: entry } = await supabase.from("entries").select("id, division_id, status").eq("id", entryId).maybeSingle();
  if (!entry) return fail(T.notAllowed);
  const update =
    decision === "approve"
      ? { status: "confirmed" as const, decline_reason: null, seed: await nextSeed(supabase, entry.division_id) }
      : { status: "declined" as const, decline_reason: (reason ?? "").trim().slice(0, 300) || null };
  const { error } = await supabase.from("entries").update(update).eq("id", entryId);
  return error ? fail(dbError(error)) : { ok: true };
}

/** Takes the entry out of the division (the rider stays in the organisation). Refused once the rider sits in a heat. */
export async function removeEntry(entryId: string): Promise<Result> {
  if (!Uuid.safeParse(entryId).success) return fail(T.failed);
  const supabase = await createClient();
  const { data, error } = await supabase.from("entries").delete().eq("id", entryId).select("id");
  if (error) return fail(error.code === "23503" ? copy.riders.inDraw : dbError(error));
  return data?.length ? { ok: true } : fail(T.notAllowed);
}
